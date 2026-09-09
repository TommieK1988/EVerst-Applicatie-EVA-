/**
 * Geboekte uren per medewerker per dag, om een werktijd-signaal mee te kunnen
 * controleren.
 *
 * Waarom dit nodig is: R9/R10 meten wanneer de AUTO reed. Dat is een indirecte
 * maat voor werktijd. Iemand die om 15:00 wegreed maar die dag 8 uur schreef,
 * verdient een gesprek; staat er 6 uur plus 2 uur verlof, dan is het signaal
 * verklaard en hoeft niemand te worden aangesproken.
 *
 * De uren staan NIET in Supabase. `uren_regels` bestaat wel, maar wordt alleen
 * door de EVA-werkbonflow gevuld en is dus onvolledig. De bron is Bouw7, live
 * via `GET /list/hour-logs/employee` — hetzelfde endpoint als /uren onder
 * Financieel. Eén call per periode: een maand ≈ 600 regels / 0,4 s, een heel
 * jaar ≈ 5.200 regels / 3 s (gemeten jul 2026).
 *
 * Koppeling: het uurlog kent alleen een Bouw7 `employee.id`. De brug naar een
 * bevinding loopt via `ulu_users.medewerker_id → medewerkers.bouw7_id`. Bewust
 * niet op naam matchen zoals /uren doet: daar is de naam alleen een label, hier
 * zou een spelfout of een dubbele voornaam stilletjes de verkeerde uren aan een
 * medewerker hangen.
 */
import 'server-only'
import { leesGlobaleBron } from '@/lib/bouw7/snapshot'
import type { UrenVensterPayload } from '@/lib/bouw7/snapshot-bronnen'
import { pgQuery } from '@/lib/wagenpark/db'
import { urenLabel } from '@/lib/wagenpark/werktijd'

/**
 * Hoe een uursoort meetelt, zoals ingedeeld in Stamgegevens → Uren.
 *
 * Bewust hier herhaald en niet geïmporteerd uit de instellingen-actions: dat is
 * een `'use server'`-module, en daar iets uit halen sleept de hele
 * server-action-keten mee een module in die alleen een lijstje nodig heeft. De
 * waarden zelf staan als check-constraint op `planning_uursoorten.uren_categorie`.
 */
type UrenCategorie = 'werk' | 'afwezig' | 'tijd_voor_tijd' | 'feestdag'

/** Wat er op één dag door één medewerker geboekt is. */
export type DagUren = {
  /** Totaal aantal uren die dag. */
  totaal: number
  /**
   * Alleen de uren die als ARBEID gelden: uursoorten met categorie `werk` (dus
   * gewerkte uren en reisuren, niet vakantie, ziek, feestdag of opgenomen tijd
   * voor tijd). Dit is het getal dat tegen de aanwezigheid van die dag wordt
   * gelegd — het totaal zou een dag met een middag verlof ten onrechte als een
   * volle werkdag laten lezen.
   *
   * `null` = er is die dag wél geboekt, maar van geen enkele uursoort is bekend
   * hoe hij telt (zie `ongeclassificeerd`). Dan hoort er een streepje op het
   * scherm, geen 0,0.
   */
  werk: number | null
  /** Uren op een uursoort zonder classificatie in Stamgegevens → Uren. */
  ongeclassificeerd: number
  /** Per uursoort, aflopend op uren — "normaal 6,0 · verlof 2,0". */
  perSoort: { naam: string; uren: number }[]
}

export type UrenPerDag = {
  /**
   * Sleutel: `${bouw7EmployeeId}|${YYYY-MM-DD}`.
   *
   * Ontbreekt een sleutel, dan is er die dag níets geboekt — dat is een
   * betekenisvolle uitkomst (0 uur), niet hetzelfde als "geen gegevens".
   */
  perDag: Map<string, DagUren>
  /**
   * Null als de gegevens bruikbaar zijn. Is Bouw7 onbereikbaar, dan staat hier
   * de reden en moet de UI een streepje tonen in plaats van 0,0 — anders lijkt
   * een storing op "iedereen heeft niets geschreven".
   */
  fout: string | null
}

const num = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isNaN(n) ? 0 : n
}

export const GEEN_UREN: UrenPerDag = { perDag: new Map(), fout: 'Uren niet opgehaald' }

/**
 * Haal alle urenboekingen in een periode op en groepeer ze per medewerker-dag.
 *
 * `van`/`tot` zijn kale dagen (YYYY-MM-DD), beide inclusief — net als Bouw7's
 * eigen `logDate`, dat ook geen tijdzone kent.
 */
export async function getUrenPerDag(van: string, tot: string): Promise<UrenPerDag> {
  // Uit het bewaarde urenvenster in plaats van een eigen bedrijfsbrede Bouw7-call per
  // paginabezoek. Fail-soft: zonder uren blijft de werktijdenlijst gewoon bruikbaar.
  const venster = (await leesGlobaleBron<UrenVensterPayload>('uren_venster')).data
  if (!venster) return { perDag: new Map(), fout: 'Urenstand nog niet opgehaald uit Bouw7' }
  if (van < venster.van) {
    return { perDag: new Map(), fout: `Periode valt vóór de bewaarde urenstand (vanaf ${venster.van})` }
  }
  const items = venster.items.filter((h) => {
    const d = h.logDate ? h.logDate.slice(0, 10) : null
    return d != null && d >= van && d <= tot
  })

  const categoriePerType = await categoriePerUursoort()

  // Eerst per (medewerker, dag) de uren per soort optellen; een medewerker
  // boekt vaak meerdere regels op dezelfde dag en dezelfde uursoort, verdeeld
  // over projecten.
  const opgeteld = new Map<string, Map<string, number>>()
  // Naast het totaal ook de arbeidskant apart: alleen categorie `werk`.
  const werkUren = new Map<string, number>()
  const onbekendeUren = new Map<string, number>()

  for (const h of items) {
    const employeeId = h.employee?.id
    const datum = h.logDate?.slice(0, 10)
    if (employeeId == null || !datum) continue

    const sleutel = `${employeeId}|${datum}`
    const soort = h.type?.name?.trim() || 'onbekend'
    let perSoort = opgeteld.get(sleutel)
    if (!perSoort) {
      perSoort = new Map()
      opgeteld.set(sleutel, perSoort)
    }
    const uren = num(h.hours)
    perSoort.set(soort, (perSoort.get(soort) ?? 0) + uren)

    // De classificatie hangt aan het Bouw7-uursoort-id, niet aan de naam: een
    // hernoemde uursoort mag niet stilletjes van categorie wisselen.
    const categorie = h.type?.id != null ? categoriePerType.get(String(h.type.id)) : undefined
    if (categorie === 'werk') werkUren.set(sleutel, (werkUren.get(sleutel) ?? 0) + uren)
    else if (categorie == null) onbekendeUren.set(sleutel, (onbekendeUren.get(sleutel) ?? 0) + uren)
  }

  const perDag = new Map<string, DagUren>()
  for (const [sleutel, perSoort] of opgeteld) {
    const lijst = [...perSoort.entries()]
      .map(([naam, uren]) => ({ naam, uren }))
      .sort((a, b) => b.uren - a.uren)
    const totaal = lijst.reduce((s, r) => s + r.uren, 0)
    const werk = werkUren.get(sleutel) ?? 0
    const ongeclassificeerd = onbekendeUren.get(sleutel) ?? 0
    perDag.set(sleutel, {
      totaal,
      // Is er geboekt maar valt alles in een uursoort zonder classificatie, dan
      // weten we niet hoeveel daarvan arbeid was. Nul tonen zou als "niets
      // gewerkt" lezen; null wordt in de tabel een streepje.
      //
      // Met een marge vergeleken en niet met `===`: `totaal` en
      // `ongeclassificeerd` tellen dezelfde uren op in een andere volgorde, dus
      // ze kunnen een biljoenste uit elkaar liggen. Op een harde gelijkheid zou
      // deze regel dan stilletjes 0 opleveren in plaats van een streepje.
      werk: totaal > 0 && werk === 0 && Math.abs(ongeclassificeerd - totaal) < 0.001 ? null : werk,
      ongeclassificeerd,
      perSoort: lijst,
    })
  }

  return { perDag, fout: null }
}

/**
 * Bouw7-uursoort-id → hoe die uursoort meetelt.
 *
 * De classificatie staat in Stamgegevens → Uren (`planning_uursoorten.uren_categorie`)
 * en wordt al gebruikt door de weekstaat. Hier hergebruikt in plaats van een
 * eigen lijstje met namen als "Vakantie uren": zo blijft er één plek waar
 * iemand bepaalt wat als gewerkte tijd geldt, en telt een nieuwe uursoort uit
 * Bouw7 pas mee zodra hij bewust is ingedeeld.
 */
async function categoriePerUursoort(): Promise<Map<string, UrenCategorie>> {
  const uit = new Map<string, UrenCategorie>()
  try {
    const rijen = await pgQuery<{ bouw7_id: string | null; uren_categorie: string | null }>(
      `select bouw7_id, uren_categorie
         from public.planning_uursoorten
        where bouw7_id is not null and uren_categorie is not null`,
      [],
    )
    for (const r of rijen) {
      if (r.bouw7_id && r.uren_categorie) uit.set(r.bouw7_id, r.uren_categorie as UrenCategorie)
    }
  } catch {
    // Zonder classificatie blijft elke uursoort "onbekend" en toont de kolom
    // arbeidsuren een streepje — beter dan overal nul.
  }
  return uit
}

/** "6,0 normaal · 2,0 verlof" — compacte verdeling voor in een tabelcel. */
export function uursoortLabel(dag: DagUren | undefined): string | null {
  if (!dag || dag.perSoort.length === 0) return null
  return dag.perSoort.map((s) => `${urenLabel(s.uren)} ${s.naam}`).join(' · ')
}
