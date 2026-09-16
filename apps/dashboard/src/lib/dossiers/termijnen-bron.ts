/**
 * dossiers/termijnen-bron.ts
 *
 * Waar een termijnschema vandaan komt, en hoe het vanuit de intake wordt weggeschreven.
 *
 * WAAROM DIT NAAST termijnen.ts STAAT
 * `termijnen.ts` draagt `'use server'`: elke geexporteerde functie daarin is een
 * aanroepbaar endpoint en hoort dus een rechtencontrole te hebben. De intake-variant
 * hieronder kan die niet hebben -- hij draait ook vanuit de verwerking van een
 * binnengekomen opdracht, en die heeft geen ingelogde gebruiker. In een 'use server'-
 * module zou dat een ongegate endpoint opleveren dat voor elk dossier een termijnstaat
 * naar Bouw7 kan schrijven. Hier is het een gewone bibliotheekfunctie, en zit de poort
 * bij de aanroeper (`lib/mailintake/actions.ts`, `mailintake:schrijven`).
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { naarKeuze, sorteerTarieven, heffingsPercentage, type BtwTariefKeuze } from '@/lib/stamdata/btw'
import { schrijfBouw7Termijnstaat, leesBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'

import { bouw7VoorDossier } from './actions'
import {
  bouwTermijnrijen, termijnBedragen,
  type TermijnschemaRegel, type BtwAandeel,
} from './termijnen-schema'

/** Leest de termijnen van een betalingsconditie-rij uit; ongeldige regels vallen af. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function leesTermijnen(ruw: any): TermijnschemaRegel[] {
  if (!Array.isArray(ruw)) return []
  return ruw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => ({
      omschrijving: String(t?.omschrijving ?? '').trim(),
      percentage: Number(t?.percentage ?? 0),
    }))
    .filter((t: TermijnschemaRegel) => Number.isFinite(t.percentage))
}

/**
 * De betalingsconditie die aan de hoofdofferte van dit dossier hangt.
 *
 * De offerte kent haar termijnen via `quotes.betalingsconditie_id` → `betalingscondities.termijnen`
 * (`[{ omschrijving, percentage }]`). Meerwerkoffertes blijven buiten beeld: die dragen hun eigen
 * regel en zeggen niets over het schema van de aanneemsom.
 */
export async function offerteBetalingsconditie(
  dossierId: string,
): Promise<{ conditieId: string; naam: string; termijnen: TermijnschemaRegel[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers').select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  if (!dossier?.everts_calc_project_id) return null

  const { data: quote } = await supabase
    .from('quotes')
    .select('betalingsconditie_id')
    .eq('project_id', dossier.everts_calc_project_id)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote?.betalingsconditie_id) return null

  const { data: conditie } = await supabase
    .from('betalingscondities').select('naam, termijnen').eq('id', quote.betalingsconditie_id).maybeSingle()
  const termijnen = leesTermijnen(conditie?.termijnen)
  if (termijnen.length === 0) return null

  return {
    conditieId: quote.betalingsconditie_id as string,
    naam: (conditie?.naam as string) ?? 'Betalingsconditie',
    termijnen,
  }
}

/**
 * Hoe de aanneemsom over de btw-tarieven is verdeeld, volgens de offerte.
 *
 * Dit is de reden dat een termijnschema niet met één btw-tarief afkan. Een Bouw7-termijn draagt
 * precies één `vatTariff`; een opdracht met 9% over arbeid en 21% over materiaal moet daar dus
 * gesplitst worden in een termijn per tarief. Zet je alles op één tarief, dan staat er btw in de
 * termijnstaat die niemand zo heeft geoffreerd — en dat rolt door naar de factuur.
 *
 * De grondslag komt uit de offerteregels en niet uit de calculatie: de offerte is wat de klant
 * heeft geaccepteerd. Tekstregels dragen geen bedrag en optionele secties zitten niet in de
 * aanneemsom, dus die tellen niet mee.
 *
 * Secties en regels worden apart gelezen in plaats van als één genest `select`. Beide zijn
 * begrensd op één offerte (`quote_id`), en zo is er geen twijfel of PostgREST een ingebedde
 * verzameling stilletjes afkapt — dat gaat nergens harder mis dan in een btw-verdeling, want een
 * ontbrekende regel verschuift de verhouding zonder dat er iets fout lijkt te gaan.
 */
export async function offerteBtwVerdeling(
  dossierId: string,
  tarieven: BtwTariefKeuze[],
): Promise<BtwAandeel[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers').select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  if (!dossier?.everts_calc_project_id) return []

  const { data: quote } = await supabase
    .from('quotes')
    .select('id, btw_tarief_id, btw_pct')
    .eq('project_id', dossier.everts_calc_project_id)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote?.id) return []

  const [sectieRes, regelRes] = await Promise.all([
    supabase.from('quote_sections').select('id, is_optioneel').eq('quote_id', quote.id),
    supabase.from('quote_lines')
      .select('section_id, soort, line_total, btw_tarief_id, btw_pct').eq('quote_id', quote.id),
  ])
  const optioneel = new Set(
    ((sectieRes?.data ?? []) as { id: string; is_optioneel: boolean | null }[])
      .filter(x => x.is_optioneel).map(x => x.id),
  )

  const perTarief = new Map<string, { aandeel: BtwAandeel; grondslag: number }>()
  let totaal = 0
  type Regel = {
    section_id: string | null; soort: string | null; line_total: number | string | null
    btw_tarief_id: string | null; btw_pct: number | string | null
  }
  for (const regel of (regelRes?.data ?? []) as Regel[]) {
    if (regel.soort === 'tekst') continue
    if (regel.section_id && optioneel.has(regel.section_id)) continue
    const bedrag = Number(regel.line_total ?? 0)
    if (!Number.isFinite(bedrag) || bedrag === 0) continue

    const tariefId = regel.btw_tarief_id ?? quote.btw_tarief_id ?? null
    const tarief = tariefId ? tarieven.find(t => t.id === tariefId) : undefined
    const pct = tarief
      ? heffingsPercentage(tarief)
      : Number(regel.btw_pct ?? quote.btw_pct ?? 21)
    const sleutel = tarief ? `t:${tarief.id}` : `p:${pct}`

    const bestaand = perTarief.get(sleutel)
    if (bestaand) bestaand.grondslag += bedrag
    else {
      perTarief.set(sleutel, {
        grondslag: bedrag,
        aandeel: {
          bouw7TariefId: tarief?.bouw7_id ?? null,
          label: tarief?.label ?? `${pct}%`,
          pct,
          aandeel: 0,
        },
      })
    }
    totaal += bedrag
  }
  if (totaal <= 0) return []

  return Array.from(perTarief.values())
    .map(({ aandeel, grondslag }) => ({ ...aandeel, aandeel: grondslag / totaal }))
    .sort((a, b) => b.pct - a.pct)
}

/**
 * De bedragen waarover een termijnschema gerekend kan worden.
 *
 * Meerwerk komt uit de EVA-meerwerkregels zodra die er zijn, en anders uit het Bouw7-aggregaat —
 * dezelfde regel die de Verkoop-tab zelf hanteert. Zou het venster een ander meerwerkbedrag
 * gebruiken dan het scherm eromheen toont, dan factureer je straks over een grondslag die niemand
 * heeft zien staan. De vergelijking kijkt naar het AANTAL goedgekeurde regels en niet naar het
 * bedrag: bij per saldo minderwerk is de som negatief.
 */

/* ------------------------------------------------------------------------------------------ *
 * Termijnschema vanuit de mailintake
 *
 * Dezelfde handeling als hierboven, maar zonder scherm en zonder ingelogde gebruiker. Drie
 * dingen zijn daarom anders, en alle drie om een reden:
 *
 *  1. **Geen rechtencontrole.** Dit draait vanuit de verwerking van een binnengekomen opdracht;
 *     die heeft geen sessie. De poort zit bij de ingang -- de server action in lib/mailintake
 *     die dit aanroept vraagt `mailintake:schrijven`.
 *  2. **Bouw7 live lezen in plaats van de snapshot.** `termijnGrondslagen` leest via
 *     `bouw7_snapshots`, en die is direct na de statuswissel per definitie oud: de aanneemsom
 *     staat er nog niet in en bestaande termijnen zijn onzichtbaar. Dat zou hier twee keer
 *     misgaan -- "geen aanneemsom" terwijl hij er wel is, en een tweede termijnstaat naast een
 *     bestaande.
 *  3. **Geen keuze.** Het schema komt uit de betalingsconditie van de offerte of er gebeurt
 *     niets. Terugvallen op een standaardschema zou betekenen dat we factureren volgens een
 *     indeling die niemand met deze klant heeft afgesproken.
 * ------------------------------------------------------------------------------------------ */

export type TermijnUitOfferteResultaat =
  | { ok: true; aangemaakt: number; grondslag: number; conditie: string }
  | {
      ok: false
      error: string
      /** Waarom het niet kon; bepaalt of er een actie voor een mens bij hoort. */
      reden: 'geen_bouw7' | 'geen_schema' | 'bestaat_al' | 'geen_bedrag' | 'geen_debiteur' | 'fout'
    }

/**
 * Maakt de verkooptermijnen aan volgens de betalingsconditie van de offerte.
 *
 * Gooit niet: elke uitkomst komt als resultaat terug, zodat de aanroeper kan besluiten of er een
 * actie voor een mens bij hoort. Een mislukt termijnschema mag nooit een zojuist gewonnen
 * opdracht onderuithalen.
 */
export async function maakTermijnschemaUitOfferte(dossierId: string): Promise<TermijnUitOfferteResultaat> {
  try {
    const ctx = await bouw7VoorDossier(dossierId)
    if (!ctx) {
      return { ok: false, reden: 'geen_bouw7', error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }
    }
    const projectId = Number(ctx.bouw7Id)
    if (!Number.isFinite(projectId)) {
      return { ok: false, reden: 'geen_bouw7', error: 'Het Bouw7-projectnummer is onbruikbaar.' }
    }

    // --- Het schema. Geen conditie op de offerte = niets te doen.
    const conditie = await offerteBetalingsconditie(dossierId).catch(() => null)
    if (!conditie || conditie.termijnen.length === 0) {
      return {
        ok: false,
        reden: 'geen_schema',
        error: 'Er staat geen betalingsconditie op de offerte, dus er valt geen termijnschema af te leiden.',
      }
    }

    // --- Wat staat er nu in Bouw7? Live, niet uit de snapshot.
    const staat = await leesBouw7Termijnstaat(projectId)
    if (staat.termijnen.length > 0) {
      return {
        ok: false,
        reden: 'bestaat_al',
        error: `Dit project heeft in Bouw7 al ${staat.termijnen.length} termijn(en); die worden niet overschreven.`,
      }
    }

    const supabase = createAdminClient()

    // --- De grondslag: wat Bouw7 zelf als aanneemsom kent, anders wat EVA net heeft
    //     weggeschreven bij het winnen van de offerte.
    let grondslag = staat.fixedPrice ?? 0
    if (!(grondslag > 0)) {
      const { data: d } = await supabase
        .from('dossiers').select('bedrag_excl_btw').eq('id', dossierId).maybeSingle()
      grondslag = Number(d?.bedrag_excl_btw ?? 0)
    }
    if (!(grondslag > 0)) {
      return {
        ok: false,
        reden: 'geen_bedrag',
        error: 'Er is nog geen aanneemsom bekend; zonder bedrag zijn er geen termijnen te berekenen.',
      }
    }

    // --- De debiteur. Staat er nog geen termijnstaat, dan komt hij van de opdrachtgever.
    let contactId = staat.contactId
    if (contactId == null) {
      const { data: d } = await supabase
        .from('dossiers')
        .select('klant:relaties!dossiers_klant_id_fkey(bouw7_id)')
        .eq('id', dossierId)
        .maybeSingle()
      const b = (d as { klant?: { bouw7_id?: number | string | null } | null } | null)?.klant?.bouw7_id
      const n = b != null ? Number(b) : NaN
      contactId = Number.isFinite(n) ? n : null
    }
    if (contactId == null) {
      return {
        ok: false,
        reden: 'geen_debiteur',
        error: 'De opdrachtgever staat niet in Bouw7, dus de termijnstaat krijgt geen debiteur.',
      }
    }

    // --- Btw-verdeling uit de offerte. Leeg betekent: we weten niet hoe de tarieven zich
    //     verhouden, en dan is elke keuze een gok die op de factuur terechtkomt.
    const tariefRes = await supabase
      .from('btw_tarieven').select('id, bouw7_id, label, percentage, verlegd').eq('actief', true)
    const tarieven = sorteerTarieven(
      ((tariefRes?.data ?? []) as Parameters<typeof naarKeuze>[0][]).map(naarKeuze),
    )
    const verdeling = await offerteBtwVerdeling(dossierId, tarieven).catch(() => [] as BtwAandeel[])
    if (verdeling.length === 0) {
      return {
        ok: false,
        reden: 'geen_schema',
        error: 'De btw-verdeling van de offerte is niet te bepalen; de termijnen zouden een tarief krijgen dat niemand zo heeft geoffreerd.',
      }
    }

    const rijen = bouwTermijnrijen(conditie.termijnen, verdeling, null)
    const bedragenPerRij = termijnBedragen(rijen, grondslag)

    const termijnen = rijen
      .map((r, i) => ({
        omschrijving: (r.omschrijving || 'Termijn').slice(0, 200),
        percentage: r.percentage,
        bedragExclBtw: bedragenPerRij[i],
        vatTariffId: r.btwTariefBouw7Id,
      }))
      .filter((r): r is typeof r & { vatTariffId: number } => r.vatTariffId != null)

    if (termijnen.length !== rijen.length) {
      return {
        ok: false,
        reden: 'geen_schema',
        error: 'Niet elk btw-tarief uit de offerte is aan Bouw7 gekoppeld; het schema zou onvolledig worden.',
      }
    }

    const res = await schrijfBouw7Termijnstaat({ projectId, contactId, aanneemsom: grondslag, termijnen })
    if (!res.ok) return { ok: false, reden: 'fout', error: res.error }

    return { ok: true, aangemaakt: res.aangemaakt, grondslag, conditie: conditie.naam }
  } catch (e) {
    return { ok: false, reden: 'fout', error: e instanceof Error ? e.message : String(e) }
  }
}
