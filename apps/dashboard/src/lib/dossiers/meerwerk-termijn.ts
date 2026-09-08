/**
 * Aangenomen meerwerk als verkooptermijn in de Bouw7-termijnstaat.
 *
 * Regie-meerwerk en stelposten worden via de nacalculatie gefactureerd
 * (lib/dossiers/facturatie-codes.ts). Meerwerk tegen een vaste prijs hoort in de termijnstaat:
 * één extra termijn met het afgesproken bedrag, die de Verkoop-tab daarna gewoon kan klaarzetten
 * als conceptfactuur. Tot sep 2026 moest iemand die termijn met de hand in Bouw7 toevoegen.
 *
 * Idempotent op `meerwerk_regels.bouw7_term_id`: een tweede akkoord of een gewijzigd bedrag werkt
 * dezelfde termijn bij. De aanneemsom op de staat (`fixedPrice`) beweegt mee met het verschil,
 * zodat de staat blijft optellen. Een termijn die al gefactureerd is laat
 * `schrijfBouw7Termijnstaat` met rust; dat komt hier terug als fout met uitleg.
 */

import { createAdminClient } from '@everts/database/server'
import { leesBouw7Termijnstaat, schrijfBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type Regel = {
  id: string
  dossier_id: string
  volgnummer: number | null
  omschrijving: string | null
  bedrag_excl_btw: number | string | null
  btw_pct: number | string | null
  afrekenwijze: string | null
  is_stelpost: boolean | null
  status: string | null
  termijn_wijze: string | null
  bouw7_nummer: string | null
  bewakingscode: string | null
  bouw7_term_id: number | null
}

/** Komt deze regel in aanmerking voor een termijn? Zo nee, met reden. */
export function meerwerkTermijnGeschikt(r: Regel): { ok: true } | { ok: false; reden: string } {
  if (r.afrekenwijze !== 'aangenomen') return { ok: false, reden: 'regiewerk gaat via de nacalculatie' }
  if (r.is_stelpost) return { ok: false, reden: 'stelposten gaan via de nacalculatie' }
  if (!(Number(r.bedrag_excl_btw) > 0)) return { ok: false, reden: 'geen bedrag' }
  if (r.termijn_wijze === 'eigen_termijnstaat') return { ok: false, reden: 'eigen termijnstaat gekozen' }
  if (r.status !== 'akkoord' && r.status !== 'voltooid') return { ok: false, reden: 'nog niet akkoord' }
  return { ok: true }
}

/**
 * Zet (of werk bij) de termijn voor deze meerwerkregel. Faalt nooit hard; de aanroeper toont de
 * fout als waarschuwing en de cron probeert het opnieuw zolang `bouw7_term_id` leeg is.
 */
export async function zetMeerwerkAlsTermijn(regelId: string): Promise<{ ok: true; termId: number } | { ok: false; error: string }> {
  try {
    const supabase = db()
    const { data: r } = await supabase
      .from('meerwerk_regels')
      .select('id, dossier_id, volgnummer, omschrijving, bedrag_excl_btw, btw_pct, afrekenwijze, is_stelpost, status, termijn_wijze, bouw7_nummer, bewakingscode, bouw7_term_id')
      .eq('id', regelId)
      .maybeSingle()
    if (!r) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
    const geschikt = meerwerkTermijnGeschikt(r as Regel)
    if (!geschikt.ok) return { ok: false, error: `Geen termijn: ${geschikt.reden}.` }

    const { data: d } = await supabase.from('dossiers').select('bouw7_id').eq('id', r.dossier_id).maybeSingle()
    if (!d?.bouw7_id) return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.' }
    const projectId = Number(d.bouw7_id)

    const staat = await leesBouw7Termijnstaat(projectId)
    if (!staat.statementId) {
      return { ok: false, error: 'Dit dossier heeft nog geen termijnstaat in Bouw7. Zet eerst het termijnschema op de Verkoop-tab; het meerwerk komt er dan als termijn bij.' }
    }
    if (!staat.contactId) return { ok: false, error: 'De termijnstaat in Bouw7 heeft geen debiteur.' }

    // Btw-tarief: het Bouw7-tarief met dit percentage (niet verlegd).
    const pct = Number(r.btw_pct ?? 21)
    const { data: tarieven } = await supabase
      .from('btw_tarieven')
      .select('bouw7_id, percentage, verlegd')
      .not('bouw7_id', 'is', null)
      .eq('verlegd', false)
    const tarief = ((tarieven ?? []) as { bouw7_id: number; percentage: number }[])
      .find(t => Math.abs(Number(t.percentage) - pct) < 0.01)
    if (!tarief) return { ok: false, error: `Geen Bouw7-btw-tarief van ${pct}% bekend in EVA.` }

    const bedrag = Math.round(Number(r.bedrag_excl_btw) * 100) / 100
    const nummer = r.bouw7_nummer ?? r.bewakingscode ?? (r.volgnummer != null ? `#${r.volgnummer}` : '')
    const omschrijving = `Meerwerk ${nummer}: ${r.omschrijving ?? ''}`.trim().replace(/:\s*$/, '')

    // De aanneemsom op de staat beweegt mee met het verschil, zodat de staat blijft optellen.
    const bestaandeTerm = r.bouw7_term_id != null ? staat.termijnen.find(t => t.id === r.bouw7_term_id) : undefined
    const oudBedrag = bestaandeTerm ? Number(bestaandeTerm.subtotal ?? 0) : 0
    const aanneemsom = Math.round(((staat.fixedPrice ?? 0) - oudBedrag + bedrag) * 100) / 100

    const res = await schrijfBouw7Termijnstaat({
      projectId,
      contactId: staat.contactId,
      aanneemsom,
      termijnen: [{
        bouw7TermId: bestaandeTerm ? r.bouw7_term_id : null,
        omschrijving,
        percentage: 0,
        bedragExclBtw: bedrag,
        vatTariffId: tarief.bouw7_id,
      }],
    }, { deelschrijving: true })
    if (!res.ok) return res

    const termId = bestaandeTerm ? (r.bouw7_term_id as number) : (res.nieuweTermIds?.[0] ?? null)
    if (termId == null) return { ok: false, error: 'Bouw7 gaf geen termijn-id terug.' }
    await supabase.from('meerwerk_regels').update({ bouw7_term_id: termId, bouw7_term_pending: false }).eq('id', regelId)
    return { ok: true, termId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij het zetten van de meerwerktermijn.' }
  }
}
