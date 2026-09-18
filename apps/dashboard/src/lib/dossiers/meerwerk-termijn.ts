/**
 * Aangenomen meerwerk als verkooptermijn in de Bouw7-termijnstaat.
 *
 * Regie-meerwerk en stelposten worden via de nacalculatie gefactureerd
 * (lib/dossiers/facturatie-codes.ts). Meerwerk tegen een vaste prijs hoort in de termijnstaat, die
 * de Verkoop-tab daarna gewoon kan klaarzetten als conceptfactuur. Tot sep 2026 moest iemand die
 * termijn met de hand in Bouw7 toevoegen.
 *
 * Hangt er een eigen offerte aan het meerwerk, dan volgt de termijnstaat het betalingsschema van
 * díe offerte (bijv. 30/30/30/10) in plaats van één bedrag ineens — anders factureer je iets
 * anders dan de klant heeft getekend. Zonder betalingsconditie blijft het één termijn.
 *
 * Idempotent op `meerwerk_regels.bouw7_term_ids`: een tweede akkoord of een gewijzigd bedrag werkt
 * dezelfde termijnen bij. De aanneemsom op de staat (`fixedPrice`) beweegt mee met het verschil,
 * zodat de staat blijft optellen. Een termijn die al gefactureerd is laat
 * `schrijfBouw7Termijnstaat` met rust; dat komt hier terug als fout met uitleg.
 */

import { createAdminClient } from '@everts/database/server'
import { leesBouw7Termijnstaat, schrijfBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'

import { leesMeerwerkOfferte } from './meerwerk-offerte'
import { termijnBedragen, type TermijnschemaRegel, type TermijnRij } from './termijnen-schema'

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
  /** Alle termijn-ids van deze regel, in schemavolgorde; leeg bij rijen van vóór het schema. */
  bouw7_term_ids?: (number | string)[] | null
  /** Meerwerk-offerte waaraan deze regel hangt; levert het betalingsschema. */
  quote_id?: string | null
  /** True als dit meerwerk al in de grondslag van de termijnstaat zat (`maakTermijnschema`). */
  in_termijnstaat: boolean | null
}

/** Komt deze regel in aanmerking voor een termijn? Zo nee, met reden. */
export function meerwerkTermijnGeschikt(r: Regel): { ok: true } | { ok: false; reden: string } {
  if (r.afrekenwijze !== 'aangenomen') return { ok: false, reden: 'regiewerk gaat via de nacalculatie' }
  if (r.is_stelpost) return { ok: false, reden: 'stelposten gaan via de nacalculatie' }
  if (!(Number(r.bedrag_excl_btw) > 0)) return { ok: false, reden: 'geen bedrag' }
  if (r.termijn_wijze === 'eigen_termijnstaat') return { ok: false, reden: 'eigen termijnstaat gekozen' }
  if (r.status !== 'akkoord' && r.status !== 'voltooid') return { ok: false, reden: 'nog niet akkoord' }
  // Bij een termijnstaat op het contracttotaal zit dit meerwerk al in de bestaande termijnen.
  if (r.in_termijnstaat) return { ok: false, reden: 'zit al in de termijnstaat verwerkt' }
  return { ok: true }
}

/**
 * Zet (of werk bij) de termijn voor deze meerwerkregel. Faalt nooit hard; de aanroeper toont de
 * fout als waarschuwing en de cron probeert het opnieuw zolang `bouw7_term_id` leeg is.
 */
export async function zetMeerwerkAlsTermijn(regelId: string): Promise<{ ok: true; termId: number; termIds: number[] } | { ok: false; error: string }> {
  try {
    const supabase = db()
    const { data: r } = await supabase
      .from('meerwerk_regels')
      .select('id, dossier_id, volgnummer, omschrijving, bedrag_excl_btw, btw_pct, afrekenwijze, is_stelpost, status, termijn_wijze, bouw7_nummer, bewakingscode, bouw7_term_id, bouw7_term_ids, quote_id, in_termijnstaat')
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
    const kop = `Meerwerk ${nummer}`.trim()

    /*
     * Het betalingsschema van de eigen offerte volgen. Meerwerk van twintigduizend euro met een
     * offerte die 30/30/30/10 belooft, hoort niet als één bedrag ineens in de termijnstaat te
     * komen: dan factureer je iets anders dan de klant heeft getekend. Hangt er geen
     * betalingsconditie aan de offerte (of is er geen offerte), dan blijft het één termijn voor
     * het hele bedrag -- precies het oude gedrag.
     */
    const offerte = r.quote_id ? await leesMeerwerkOfferte(r.quote_id).catch(() => null) : null
    const schema: TermijnschemaRegel[] = offerte && offerte.termijnen.length > 0
      ? offerte.termijnen
      : [{ omschrijving: '', percentage: 100 }]

    const rijen: TermijnRij[] = schema.map(t => ({ ...t, btwTariefBouw7Id: tarief.bouw7_id }))
    const bedragen = termijnBedragen(rijen, bedrag)

    // Bestaande termijnen van deze regel, in schemavolgorde. `bouw7_term_ids` is de bron; een rij
    // van vóór die kolom draagt alleen `bouw7_term_id` en telt als één termijn.
    const eerdereIds: number[] = Array.isArray(r.bouw7_term_ids) && r.bouw7_term_ids.length > 0
      ? r.bouw7_term_ids.map(Number)
      : (r.bouw7_term_id != null ? [r.bouw7_term_id] : [])
    const bestaandeTermijnen = eerdereIds.map(id => staat.termijnen.find(t => t.id === id) ?? null)

    // De aanneemsom op de staat beweegt mee met het verschil, zodat de staat blijft optellen.
    const oudBedrag = bestaandeTermijnen.reduce((som, t) => som + (t ? Number(t.subtotal ?? 0) : 0), 0)
    const aanneemsom = Math.round(((staat.fixedPrice ?? 0) - oudBedrag + bedrag) * 100) / 100

    const omschrijvingen = rijen.map(rij =>
      [kop, rij.omschrijving || r.omschrijving || ''].filter(Boolean).join(': '))

    const res = await schrijfBouw7Termijnstaat({
      projectId,
      contactId: staat.contactId,
      aanneemsom,
      termijnen: rijen.map((_, i) => ({
        // Hergebruik het id op dezelfde plek in het schema; is het schema gegroeid, dan is er voor
        // die plek nog geen termijn en komt er een bij.
        bouw7TermId: bestaandeTermijnen[i]?.id ?? null,
        omschrijving: omschrijvingen[i],
        percentage: 0,
        bedragExclBtw: bedragen[i],
        vatTariffId: tarief.bouw7_id,
      })),
    }, { deelschrijving: true })
    if (!res.ok) return res

    /*
     * Ids terugleggen op schemavolgorde, en daarvoor de staat opnieuw lezen in plaats van
     * `nieuweTermIds` op volgorde te vertrouwen. Die lijst is de terugleesvolgorde van Bouw7, en
     * of die gelijk is aan de volgorde waarin wij de termijnen aanboden is nergens toegezegd.
     * Zat het ernaast, dan zou een volgende bijwerking het bedrag van de 1e termijn op de 4e
     * schrijven. Matchen op omschrijving is eenduidig: die dragen het meerwerknummer.
     */
    const na = await leesBouw7Termijnstaat(projectId).catch(() => null)
    const gebruikt = new Set<number>()
    const termIds = rijen.map((_, i) => {
      const bestaand = bestaandeTermijnen[i]?.id
      if (bestaand != null) { gebruikt.add(bestaand); return bestaand }
      const match = (na?.termijnen ?? []).find(t =>
        !gebruikt.has(t.id)
        && (t.description ?? '') === omschrijvingen[i]
        && Math.round(Number(t.subtotal ?? 0) * 100) === Math.round(bedragen[i] * 100))
      if (match) { gebruikt.add(match.id); return match.id }
      return null
    })
    const gezet = termIds.filter((x): x is number => x != null)
    if (gezet.length === 0) return { ok: false, error: 'Bouw7 gaf geen termijn-id terug.' }
    await supabase
      .from('meerwerk_regels')
      .update({ bouw7_term_id: gezet[0], bouw7_term_ids: gezet, bouw7_term_pending: false })
      .eq('id', regelId)
    return { ok: true, termId: gezet[0], termIds: gezet }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij het zetten van de meerwerktermijn.' }
  }
}
