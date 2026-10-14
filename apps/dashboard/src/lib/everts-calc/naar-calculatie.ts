import type { MeetregelAggregaat } from './types'

// ─── NAAR CALCULATIE ─────────────────────────────────────────────────────────
// Per code wat de meetstaat oplevert naast wat er nu in de calculatie staat. Zo zie
// je vóór het verwerken wat er verandert, in plaats van een ✓ of ● per code.

export type VerwerkStatus = 'vervallen' | 'nieuw' | 'gewijzigd' | 'gelijk'

export interface NaarCalculatieRij {
  aggregaat: MeetregelAggregaat
  status: VerwerkStatus
  /** Hoeveelheid die nu in de calculatie staat; null als er nog geen regel is. */
  nu: number | null
  /** Hoeveelheid volgens de meetstaat. */
  wordt: number
  /** wordt − nu; bij een nieuwe code de hele hoeveelheid. */
  verschil: number
}

const RANG: Record<VerwerkStatus, number> = { vervallen: 0, nieuw: 1, gewijzigd: 2, gelijk: 3 }
// Verschillen kleiner dan een halve honderdste zijn afronding, geen wijziging.
const MARGE = 0.005

/**
 * @param aggregaten de aggregaten van één groep
 * @param openIds    ids uit `teVerwerken`: alleen die vervallen codes doen er nog toe
 * @param hoeveelheidPerRegel hoeveelheid per calculatieregel-id
 */
export function naarCalculatie(
  aggregaten: MeetregelAggregaat[],
  openIds: ReadonlySet<string>,
  hoeveelheidPerRegel: ReadonlyMap<string, number>,
): NaarCalculatieRij[] {
  const rijen: NaarCalculatieRij[] = []
  for (const a of aggregaten) {
    const wordt = a.totaal_hoeveelheid > 0 ? a.totaal_hoeveelheid : 0
    const nu = a.calculatieregel_id !== undefined ? hoeveelheidPerRegel.get(a.calculatieregel_id) ?? null : null

    if (wordt <= 0) {
      // Alleen tonen zolang het nog iets in de calculatie verandert.
      if (!openIds.has(a.id) || nu === null) continue
      rijen.push({ aggregaat: a, status: 'vervallen', nu, wordt: 0, verschil: -nu })
      continue
    }
    if (nu === null) {
      rijen.push({ aggregaat: a, status: 'nieuw', nu: null, wordt, verschil: wordt })
      continue
    }
    const verschil = wordt - nu
    rijen.push({ aggregaat: a, status: Math.abs(verschil) < MARGE ? 'gelijk' : 'gewijzigd', nu, wordt, verschil })
  }
  return rijen.sort((x, y) =>
    RANG[x.status] - RANG[y.status]
    || (x.aggregaat.bestekcode ?? '').localeCompare(y.aggregaat.bestekcode ?? '', 'nl', { numeric: true })
    || x.aggregaat.onderdeel.localeCompare(y.aggregaat.onderdeel, 'nl'))
}

/** Aantal rijen per status, voor de samenvatting boven de tabel. */
export function telPerStatus(rijen: NaarCalculatieRij[]): Record<VerwerkStatus, number> {
  const tel: Record<VerwerkStatus, number> = { vervallen: 0, nieuw: 0, gewijzigd: 0, gelijk: 0 }
  for (const r of rijen) tel[r.status]++
  return tel
}
