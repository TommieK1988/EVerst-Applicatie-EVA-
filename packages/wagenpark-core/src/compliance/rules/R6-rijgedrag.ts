/**
 * R6 — Rijgedrag-patroon per week.
 *
 * Niet elke lage ritscore is een bevinding — iedereen heeft weleens een slechte
 * rit. Alleen als een bestuurder meer dan N keer per week onveilig rijdt is er
 * sprake van een patroon.
 *
 * Logica:
 *  - Bucket trips per bestuurder × ISO-week
 *  - Tel trips met score < waarschuwing-drempel (default 70)
 *  - Als aantal > frequentie_per_week (default 2): waarschuwing-bevinding voor die week
 *  - Als aantal zeer-lage trips (score < overtreding-drempel, default 50) > 2:
 *    escaleer naar overtreding
 */

import type { ComplianceBevindingInput } from '../../types'
import type { RuleModule } from '../types'

function isoWeekLabel(dateStr: string): { label: string; weekStart: string; weekEnd: string } {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dayNum = d.getUTCDay() || 7 // ma=1..zo=7
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - dayNum + 1)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  // ISO week-nummer: donderdag van deze week bepaalt het jaar+week
  const target = new Date(d)
  target.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
  const label = `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
  return {
    label,
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  }
}

type LageRit = {
  id: string
  start_datum: string
  start_tijd: string
  score: number
  afstand_km: number | null
  adres_stop: string | null
}

type Bucket = {
  user_id: number
  volledige_naam: string | null
  week: string
  week_start: string
  week_eind: string
  laagTrips: LageRit[]
  zeerLaagTrips: LageRit[]
}

export const R6: RuleModule = {
  code: 'R6',
  runner: ({ trips, regels, uluUsers }) => {
    const regel = regels.get('R6')
    const cfg = (regel?.drempel_config ?? {}) as Record<string, number>
    const waarschuwing = cfg.score_waarschuwing ?? 70
    const overtreding = cfg.score_overtreding ?? 50
    const drempelPerWeek = cfg.frequentie_per_week ?? 2 // > 2 = 3+ per week = bevinding

    const buckets = new Map<string, Bucket>()
    for (const t of trips) {
      if (t.score == null || t.user_id_ulu == null) continue
      if (t.score >= waarschuwing) continue

      const { label, weekStart, weekEnd } = isoWeekLabel(t.start_datum)
      const key = `${t.user_id_ulu}|${label}`
      let b = buckets.get(key)
      if (!b) {
        const user = uluUsers?.get(t.user_id_ulu)
        b = {
          user_id: t.user_id_ulu,
          volledige_naam: user?.volledige_naam ?? null,
          week: label,
          week_start: weekStart,
          week_eind: weekEnd,
          laagTrips: [],
          zeerLaagTrips: [],
        }
        buckets.set(key, b)
      }
      const rit: LageRit = {
        id: t.id,
        start_datum: t.start_datum,
        start_tijd: t.start_tijd,
        score: t.score,
        afstand_km: t.afstand_km,
        adres_stop: t.adres_stop,
      }
      b.laagTrips.push(rit)
      if (t.score < overtreding) b.zeerLaagTrips.push(rit)
    }

    const out: ComplianceBevindingInput[] = []
    for (const b of Array.from(buckets.values())) {
      if (b.laagTrips.length <= drempelPerWeek) continue

      const gem = b.laagTrips.reduce((a: number, r: LageRit) => a + r.score, 0) / b.laagTrips.length
      const escaleer = b.zeerLaagTrips.length > drempelPerWeek
      const ernst: 'overtreding' | 'waarschuwing' = escaleer ? 'overtreding' : 'waarschuwing'
      const label = b.volledige_naam ?? `ULU #${b.user_id}`

      out.push({
        regel_code: 'R6',
        voertuig_id: null,
        medewerker_id: null,
        trip_id: null,
        periode_start: b.week_start,
        periode_eind: b.week_eind,
        ernst,
        omschrijving:
          `${label}: ${b.laagTrips.length} ritten met rijscore <${waarschuwing} in week ${b.week} ` +
          `(${b.week_start} t/m ${b.week_eind}). ` +
          (escaleer
            ? `Waarvan ${b.zeerLaagTrips.length} zeer-lage scores (<${overtreding}) — patroon van ernstig onveilig rijgedrag.`
            : `Gemiddelde score ${gem.toFixed(0)}/100 — patroon van onveilig rijgedrag.`),
        data: {
          user_id_ulu: b.user_id,
          label,
          week: b.week,
          aantal_laag: b.laagTrips.length,
          aantal_zeer_laag: b.zeerLaagTrips.length,
          gemiddelde_score: Math.round(gem),
          drempel_score: waarschuwing,
          drempel_frequentie_per_week: drempelPerWeek,
          slechtste_ritten: b.laagTrips
            .sort((a: LageRit, r: LageRit) => a.score - r.score)
            .slice(0, 10)
            .map((r) => ({
              datum: r.start_datum,
              tijd: r.start_tijd.slice(0, 5),
              score: r.score,
              afstand_km: r.afstand_km,
              naar: r.adres_stop,
            })),
          uitleg_regel:
            `Deze regel signaleert patronen, niet losse incidenten. Iedereen heeft weleens een ` +
            `slechte rit — onze drempel is: meer dan ${drempelPerWeek} ritten met score <${waarschuwing} ` +
            `in één week. Bij meer dan ${drempelPerWeek} ritten met zeer-lage score (<${overtreding}) ` +
            `wordt het als overtreding gemarkeerd. Drempels aanpasbaar via Instellingen.`,
        },
      })
    }
    return out
  },
}
