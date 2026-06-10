/**
 * R3 — Buitenlandse ritten. Info-signaal: tankpas alleen NL geldig.
 */

import type { RuleModule } from '../types'
import { isBuitenlandAdres } from '../../utils/distance'

export const R3: RuleModule = {
  code: 'R3',
  runner: ({ trips }) => {
    const out = []
    for (const t of trips) {
      if (isBuitenlandAdres(t.adres_start) || isBuitenlandAdres(t.adres_stop)) {
        out.push({
          regel_code: 'R3',
          voertuig_id: t.voertuig_id,
          medewerker_id: t.medewerker_id,
          trip_id: t.id,
          periode_start: t.start_datum,
          periode_eind: t.start_datum,
          ernst: 'info' as const,
          omschrijving: `Buitenlandse locatie op rit ${t.start_datum} ${t.start_tijd} — tankpas is NL-only.`,
          data: {
            user_id_ulu: t.user_id_ulu ?? undefined,
            adres_start: t.adres_start,
            adres_stop: t.adres_stop,
            afstand_km: t.afstand_km,
          },
        })
      }
    }
    return out
  },
}
