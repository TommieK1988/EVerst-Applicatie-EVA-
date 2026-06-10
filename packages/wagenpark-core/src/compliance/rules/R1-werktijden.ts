/**
 * R1 — Privé-rit buiten werktijd (voor bestuurders zonder bijtelling).
 *
 * Logica:
 *  - Rit is door het systeem als privé geclassificeerd (rit_type_berekend = 'prive')
 *    → dus weekend of weekdag buiten 07:00-17:00
 *  - Bestuurder betaalt GEEN bijtelling (mag niet privé rijden)
 *  → Individuele info-bevinding per rit
 *
 * De ULU-markering (rit_type_ulu) wordt bewust NIET gebruikt omdat ULU alle ritten
 * automatisch als "Zakelijk" registreert, wat niet als leerbron bruikbaar is.
 *
 * Bijtelling-aware: bestuurders die bijtelling betalen mogen privé rijden, dus
 * voor hen geen signaal. Het aggregaat (totaal km/jaar) loopt via R2a/R2b.
 */

import type { RuleModule } from '../types'
import { isWeekend } from '../../utils/time'

const weekdagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

function categoriseerPriveTijd(startDatum: string, startTijd: string): {
  reden: string
  detail: string
} {
  const d = new Date(startDatum + 'T12:00:00')
  const dag = weekdagNamen[d.getDay()]
  const uur = parseInt(startTijd.slice(0, 2), 10)
  const min = startTijd.slice(3, 5)
  if (isWeekend(startDatum)) {
    return {
      reden: 'weekend',
      detail: `${dag} ${startDatum.slice(8, 10)}-${startDatum.slice(5, 7)} ${uur}:${min}`,
    }
  }
  if (uur >= 17 && uur < 22) {
    return { reden: 'avond', detail: `${dag} ${uur}:${min} (na 17:00)` }
  }
  if (uur < 7 && uur >= 5) {
    return { reden: 'vroeg', detail: `${dag} ${uur}:${min} (voor 07:00)` }
  }
  return { reden: 'nacht', detail: `${dag} ${uur}:${min} (nacht)` }
}

export const R1: RuleModule = {
  code: 'R1',
  runner: ({ trips, uluUsers }) => {
    const out = []
    for (const t of trips) {
      // Alleen ritten die het systeem als privé rekent
      if (t.rit_type_berekend !== 'prive') continue

      // Bestuurder moet bekend zijn — anders geen bijtelling-check mogelijk
      const user = t.user_id_ulu != null ? uluUsers?.get(t.user_id_ulu) : undefined
      if (!user) continue

      // Bestuurders mét bijtelling mogen privé rijden → geen signaal
      if (user.bijtelling_betaald) continue

      const { reden, detail } = categoriseerPriveTijd(t.start_datum, t.start_tijd)
      out.push({
        regel_code: 'R1',
        voertuig_id: t.voertuig_id,
        medewerker_id: t.medewerker_id,
        trip_id: t.id,
        periode_start: t.start_datum,
        periode_eind: t.start_datum,
        ernst: 'info' as const,
        omschrijving:
          `Privé-rit op ${detail}, ${t.afstand_km ?? '?'} km naar ` +
          `${(t.adres_stop ?? 'onbekend').slice(0, 60)}. ` +
          `${user.volledige_naam ?? 'Bestuurder'} betaalt geen bijtelling — rit telt mee met jaarlijkse 500 km limiet (R2b).`,
        data: {
          reden_prive: reden,
          user_id_ulu: t.user_id_ulu ?? undefined,
          start_tijd: t.start_tijd,
          start_datum: t.start_datum,
          afstand_km: t.afstand_km,
          adres_start: t.adres_start,
          adres_stop: t.adres_stop,
          uitleg_regel:
            'Werktijd volgens systeem: weekdagen 07:00-17:00. Alles daarbuiten of in ' +
            'het weekend is privé. Voor bestuurders zonder bijtelling is dit een info-' +
            'signaal per rit — elke rit telt mee voor R2b (max 500 km/jaar). ' +
            'Bestuurders met bijtelling mogen privé rijden en krijgen dit signaal niet. ' +
            'Als deze rit écht zakelijk was, markeer als uitzondering of gebruik ' +
            '"Altijd toestaan" voor terugkerende situaties (bv. weekendwerkers).',
        },
      })
    }
    return out
  },
}
