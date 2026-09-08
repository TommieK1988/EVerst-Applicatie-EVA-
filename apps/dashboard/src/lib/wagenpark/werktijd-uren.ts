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
import { urenLabel } from '@/lib/wagenpark/werktijd'

/** Wat er op één dag door één medewerker geboekt is. */
export type DagUren = {
  /** Totaal aantal uren die dag. */
  totaal: number
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

  // Eerst per (medewerker, dag) de uren per soort optellen; een medewerker
  // boekt vaak meerdere regels op dezelfde dag en dezelfde uursoort, verdeeld
  // over projecten.
  const opgeteld = new Map<string, Map<string, number>>()

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
    perSoort.set(soort, (perSoort.get(soort) ?? 0) + num(h.hours))
  }

  const perDag = new Map<string, DagUren>()
  for (const [sleutel, perSoort] of opgeteld) {
    const lijst = [...perSoort.entries()]
      .map(([naam, uren]) => ({ naam, uren }))
      .sort((a, b) => b.uren - a.uren)
    perDag.set(sleutel, {
      totaal: lijst.reduce((s, r) => s + r.uren, 0),
      perSoort: lijst,
    })
  }

  return { perDag, fout: null }
}

/** "6,0 normaal · 2,0 verlof" — compacte verdeling voor in een tabelcel. */
export function uursoortLabel(dag: DagUren | undefined): string | null {
  if (!dag || dag.perSoort.length === 0) return null
  return dag.perSoort.map((s) => `${urenLabel(s.uren)} ${s.naam}`).join(' · ')
}
