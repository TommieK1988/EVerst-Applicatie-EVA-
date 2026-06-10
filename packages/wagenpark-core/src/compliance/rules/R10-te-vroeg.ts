/**
 * R10 — Te vroeg weg van werk.
 *
 * Laatste rit van de werkdag eindigt ruim voor verwachte werktijd_eind − marge.
 * Alleen actief voor bestuurders waar werktijd_eind is ingesteld (ulu_users).
 *
 * Logica per (bestuurder × werkdag):
 *  - Laatste rit op die dag (hoogste start_tijd)
 *  - Bepaal effectieve eind-tijd: stop_tijd, anders start_tijd van laatste rit
 *  - Als feitelijke eind < werktijd_eind − marge → bevinding
 *  - Alleen weekdagen (ma-vr)
 */

import type { ComplianceBevindingInput, UluTrip } from '../../types'
import type { RuleModule, UluUserInfo } from '../types'

function parseHM(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function isoWeekdag(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay()
}

const dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

export const R10: RuleModule = {
  code: 'R10',
  runner: ({ trips, uluUsers, regels }) => {
    const regel = regels.get('R10')
    const cfg = (regel?.drempel_config ?? {}) as Record<string, number>
    const margeMin = cfg.marge_minuten ?? 30

    if (!uluUsers) return []

    type DayKey = string
    const laatste = new Map<
      DayKey,
      { user: UluUserInfo; datum: string; laatsteTrip: UluTrip }
    >()

    for (const t of trips) {
      if (t.user_id_ulu == null) continue
      const user = uluUsers.get(t.user_id_ulu)
      if (!user?.werktijd_eind) continue
      const dow = isoWeekdag(t.start_datum)
      if (dow === 0 || dow === 6) continue

      const key = `${t.user_id_ulu}|${t.start_datum}`
      const huidige = laatste.get(key)
      if (!huidige || t.start_tijd > huidige.laatsteTrip.start_tijd) {
        laatste.set(key, { user, datum: t.start_datum, laatsteTrip: t })
      }
    }

    const out: ComplianceBevindingInput[] = []
    for (const { user, datum, laatsteTrip } of Array.from(laatste.values())) {
      if (!user.werktijd_eind) continue
      const verwacht = parseHM(user.werktijd_eind)
      // Effectieve eindtijd: stop_tijd indien bekend, anders start_tijd
      const eindTijd = laatsteTrip.stop_tijd ?? laatsteTrip.start_tijd
      const feitelijk = parseHM(eindTijd.slice(0, 5))
      const verschil = verwacht - feitelijk

      if (verschil <= margeMin) continue

      const ernst: 'info' | 'waarschuwing' | 'overtreding' =
        verschil > 90 ? 'waarschuwing' : 'info'
      const dag = dagNamen[isoWeekdag(datum)]
      const label = user.volledige_naam ?? `Bestuurder #${user.id}`

      out.push({
        regel_code: 'R10',
        voertuig_id: laatsteTrip.voertuig_id ?? null,
        medewerker_id: null,
        trip_id: laatsteTrip.id,
        periode_start: datum,
        periode_eind: datum,
        ernst,
        omschrijving:
          `${label}: op ${dag} ${datum} laatste rit eindigde om ${eindTijd.slice(0, 5)} — ` +
          `${verschil} min voor verwacht werktijd-eind (${user.werktijd_eind.slice(0, 5)}).`,
        data: {
          user_id_ulu: user.id,
          werktijd_eind: user.werktijd_eind.slice(0, 5),
          feitelijk_eind: eindTijd.slice(0, 5),
          verschil_minuten: verschil,
          marge_minuten: margeMin,
          dag,
          adres_start: laatsteTrip.adres_start,
          adres_stop: laatsteTrip.adres_stop,
          uitleg_regel:
            `Vergelijkt de laatste rit van de dag met de verwachte eind-werktijd ` +
            `van de bestuurder. Marge: ${margeMin} min. Verschil >90 min wordt waarschuwing. ` +
            `Regel vuurt alleen als werktijd_eind is ingesteld in het bestuurder-profiel.`,
        },
      })
    }
    return out
  },
}
