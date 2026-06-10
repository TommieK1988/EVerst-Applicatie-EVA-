/**
 * R9 — Te laat aankomen op werk.
 *
 * Eerste rit van de werkdag begint na verwachte werktijd_start + marge.
 * Alleen actief voor bestuurders waar werktijd_start is ingesteld (ulu_users).
 *
 * Logica per (bestuurder × werkdag):
 *  - Eerste rit op die dag (laagste start_tijd)
 *  - Als start_tijd > werktijd_start + marge → bevinding
 *  - Alleen weekdagen (ma-vr), tenzij allowance of handmatige override
 */

import type { ComplianceBevindingInput, UluTrip } from '../../types'
import type { RuleModule, UluUserInfo } from '../types'

function parseHM(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function isoWeekdag(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay() // 0=zo, 6=za
}

const dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

export const R9: RuleModule = {
  code: 'R9',
  runner: ({ trips, uluUsers, regels }) => {
    const regel = regels.get('R9')
    const cfg = (regel?.drempel_config ?? {}) as Record<string, number>
    const margeMin = cfg.marge_minuten ?? 15

    if (!uluUsers) return []

    // Groepeer trips per (user, datum) en vind de vroegste start
    type DayKey = string
    const earliest = new Map<
      DayKey,
      { user: UluUserInfo; datum: string; eersteTrip: UluTrip }
    >()

    for (const t of trips) {
      if (t.user_id_ulu == null) continue
      const user = uluUsers.get(t.user_id_ulu)
      if (!user?.werktijd_start) continue
      const dow = isoWeekdag(t.start_datum)
      if (dow === 0 || dow === 6) continue // alleen werkdagen

      const key = `${t.user_id_ulu}|${t.start_datum}`
      const huidige = earliest.get(key)
      if (!huidige || t.start_tijd < huidige.eersteTrip.start_tijd) {
        earliest.set(key, { user, datum: t.start_datum, eersteTrip: t })
      }
    }

    const out: ComplianceBevindingInput[] = []
    for (const { user, datum, eersteTrip } of Array.from(earliest.values())) {
      if (!user.werktijd_start) continue
      const verwacht = parseHM(user.werktijd_start)
      const feitelijk = parseHM(eersteTrip.start_tijd.slice(0, 5))
      const verschil = feitelijk - verwacht

      if (verschil <= margeMin) continue

      const ernst: 'info' | 'waarschuwing' | 'overtreding' =
        verschil > 60 ? 'waarschuwing' : 'info'
      const dag = dagNamen[isoWeekdag(datum)]
      const label = user.volledige_naam ?? `Bestuurder #${user.id}`

      out.push({
        regel_code: 'R9',
        voertuig_id: eersteTrip.voertuig_id ?? null,
        medewerker_id: null,
        trip_id: eersteTrip.id,
        periode_start: datum,
        periode_eind: datum,
        ernst,
        omschrijving:
          `${label}: op ${dag} ${datum} om ${eersteTrip.start_tijd.slice(0, 5)} begonnen — ` +
          `${verschil} min na verwachte start (${user.werktijd_start.slice(0, 5)}).`,
        data: {
          user_id_ulu: user.id,
          werktijd_start: user.werktijd_start.slice(0, 5),
          feitelijke_start: eersteTrip.start_tijd.slice(0, 5),
          verschil_minuten: verschil,
          marge_minuten: margeMin,
          dag,
          adres_start: eersteTrip.adres_start,
          adres_stop: eersteTrip.adres_stop,
          uitleg_regel:
            `Vergelijkt de eerste rit van de dag met de verwachte start-werktijd ` +
            `van de bestuurder. Marge: ${margeMin} min. Verschil >60 min wordt waarschuwing. ` +
            `Regel vuurt alleen als werktijd_start is ingesteld in het bestuurder-profiel.`,
        },
      })
    }
    return out
  },
}
