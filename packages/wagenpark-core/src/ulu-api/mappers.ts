/**
 * Mappers van ULU API-formaat naar onze interne database-shape.
 *
 * Belangrijke kalibraties (bevestigd 17-apr-2026 op live API):
 *  - trip.distance       → meters  (10_720 voor ±10,7 km)
 *  - trip.duration       → seconden
 *  - trip.odometer_start → meters
 *  - trip.max_speed      → km/h (integer)
 *  - trip.score          → "0.0"–"1.0" string → schalen naar 0-100 int
 *  - trip.privacy        → 'business' / 'private' / 'commute' / ...
 *  - trip.start_at       → lokale tijd "YYYY-MM-DD HH:MM:SS.mmm" (zonder timezone)
 */

import type { UluTripInput } from '../types'
import type { UluTrip as ApiTrip, UluUser as ApiUser, UluVehicle as ApiVehicle } from './types'
import { normalizeKenteken } from '../utils/distance'

/**
 * Converteer een ULU API trip naar het `ulu_trips` insert-formaat.
 * `vehicleMap` wordt gebruikt om kenteken te resolven.
 * `userMap` (optioneel) wordt gebruikt om user_id → naam om te zetten.
 */
export function mapApiTripToRow(
  trip: ApiTrip,
  vehicleMap: Map<number, ApiVehicle>,
  userMap?: Map<number, ApiUser>,
): UluTripInput | null {
  const vehicle = vehicleMap.get(trip.vehicle_id)
  const kenteken = normalizeKenteken(vehicle?.license_plate ?? '')
  if (!kenteken) return null
  if (!trip.start_at) return null

  // start_at is "YYYY-MM-DD HH:MM:SS.mmm" (lokaal, geen TZ-indicator)
  const { date: startDatum, time: startTijd } = parseLocalTimestamp(trip.start_at)
  if (!startDatum || !startTijd) return null
  const { time: stopTijd } = trip.stop_at
    ? parseLocalTimestamp(trip.stop_at)
    : { time: null }

  return {
    bestuurder_naam_raw: trip.user_id != null
      ? composeUserName(userMap?.get(trip.user_id))
      : null,
    user_id_ulu: trip.user_id ?? null,
    kenteken,
    start_datum: startDatum,
    start_tijd: startTijd,
    stop_tijd: stopTijd,
    adres_start: composeAddress(
      trip.start_road_name,
      trip.start_road_place,
      trip.start_road_country,
    ),
    adres_stop: composeAddress(
      trip.stop_road_name,
      trip.stop_road_place,
      trip.stop_road_country,
    ),
    afstand_km: trip.distance != null ? trip.distance / 1000 : null,
    duur_seconden: trip.duration ?? null,
    km_stand_start: trip.odometer_start != null ? trip.odometer_start / 1000 : null,
    km_stand_stop: trip.odometer_stop != null ? trip.odometer_stop / 1000 : null,
    rit_type_ulu: mapApiPrivacy(trip.privacy),
    score: parseScoreToPercent(trip.score),
    import_batch_id: null,
  }
}

/** Parseert "YYYY-MM-DD HH:MM:SS[.fff]" naar aparte date/time-strings. */
function parseLocalTimestamp(value: string): { date: string | null; time: string | null } {
  if (!value) return { date: null, time: null }
  // Regex die zowel "2026-04-17 07:21:31.000" als "2026-04-17T07:21:31" aankan.
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  if (!m) return { date: null, time: null }
  return { date: m[1], time: m[2] }
}

/** Voeg losse adres-onderdelen samen tot één string (Nederlands leesbaar). */
function composeAddress(
  road: string | null | undefined,
  place: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const parts = [road, place].filter((p) => p && p.trim().length > 0)
  const base = parts.join(', ')
  // Land alleen toevoegen als het niet NL is (anders ruis)
  if (country && country.trim().toUpperCase() !== 'NL' && country.trim().length > 0) {
    return base ? `${base} (${country.toUpperCase()})` : `(${country.toUpperCase()})`
  }
  return base || null
}

/** Map de string-privacy naar onze NL-waarden (consistent met Excel-era). */
function mapApiPrivacy(p: string | null | undefined): string | null {
  if (!p) return null
  const lower = p.toLowerCase().trim()
  if (lower === 'business') return 'Zakelijk'
  if (lower === 'private') return 'Privé'
  if (lower === 'commute' || lower === 'commuting') return 'Woon werk'
  if (lower === 'correction') return 'Correctie'
  return p
}

/** ULU score "0.96" → 96. null / leeg → null. */
function parseScoreToPercent(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  if (!Number.isFinite(n)) return null
  // Score is typisch 0..1. Sommige integraties sturen 0..100 al — detecteer.
  const scaled = n <= 1 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

/**
 * Mapper voor voertuigen (gebruikt bij upsert).
 */
export function mapApiVehicleToVoertuig(v: ApiVehicle): {
  kenteken: string
  merk: string | null
  model: string | null
} | null {
  const kenteken = normalizeKenteken(v.license_plate ?? '')
  if (!kenteken) return null
  return {
    kenteken,
    merk: v.make ?? null,   // ULU gebruikt `make`, wij opslaan als merk
    model: v.model ?? null,
  }
}

/** Bouw een leesbare naam uit user. Gebruikt `name` als aanwezig, anders first+last. */
export function composeUserName(user: ApiUser | undefined | null): string | null {
  if (!user) return null
  if (user.name && user.name.trim()) return user.name.trim()
  const parts = [user.firstname, user.lastname].filter(
    (p): p is string => !!p && p.trim().length > 0,
  )
  return parts.length ? parts.join(' ') : user.email ?? null
}
