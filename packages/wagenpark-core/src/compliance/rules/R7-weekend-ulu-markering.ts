/**
 * R7 — Weekendritten met ULU-markering 'Zakelijk'.
 * Informatief signaal voor leermomenten.
 *
 * Bijtelling-aware: bestuurders die bijtelling betalen mogen privé rijden (ook
 * weekend), dus voor hen is de ULU-markering niet relevant — geen bevinding.
 */

import type { RuleModule } from '../types'
import { isWeekend } from '../../utils/time'

const dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

export const R7: RuleModule = {
  code: 'R7',
  runner: ({ trips, uluUsers }) => {
    const out = []
    for (const t of trips) {
      if (!isWeekend(t.start_datum)) continue
      if (!t.rit_type_ulu) continue
      if (!/zakelijk/i.test(t.rit_type_ulu)) continue

      // Skip als bestuurder bijtelling betaalt — hij mag weekend privé rijden
      const user = t.user_id_ulu != null ? uluUsers?.get(t.user_id_ulu) : undefined
      if (user?.bijtelling_betaald) continue

      const dagNaam = dagNamen[new Date(t.start_datum + 'T12:00:00').getDay()]
      out.push({
        regel_code: 'R7',
        voertuig_id: t.voertuig_id,
        medewerker_id: t.medewerker_id,
        trip_id: t.id,
        periode_start: t.start_datum,
        periode_eind: t.start_datum,
        ernst: 'info' as const,
        omschrijving:
          `Rit op ${dagNaam} ${t.start_datum} ${t.start_tijd.slice(0, 5)} (${t.afstand_km ?? '?'} km) ` +
          `werd in de ULU-app als 'Zakelijk' gemarkeerd — het systeem rekent weekendritten ` +
          `echter altijd als privé.`,
        data: {
          reden_prive: 'weekend',
          user_id_ulu: t.user_id_ulu ?? undefined,
          dag: dagNaam,
          rit_type_ulu: t.rit_type_ulu,
          afstand_km: t.afstand_km,
          adres_start: t.adres_start,
          adres_stop: t.adres_stop,
          uitleg_regel:
            'In het systeem zijn alle weekendritten privé. Bestuurders zonder bijtelling die ' +
            'weekendritten als "zakelijk" in ULU markeren → leermoment. Bestuurders met bijtelling ' +
            'krijgen hier geen signaal (mogen privé rijden). Voor weekendwerkers: gebruik ' +
            '"altijd toestaan" zodat dit signaal structureel verdwijnt.',
        },
      })
    }
    return out
  },
}
