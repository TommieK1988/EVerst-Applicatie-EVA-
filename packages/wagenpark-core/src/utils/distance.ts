/** Afstand-helpers: zoeken en parsen van kenteken-strings en coördinaten. */

/** Een geografisch punt (WGS84). */
export type GeoPunt = { lat: number; lng: number }

/**
 * Hemelsbrede afstand tussen twee coördinaten in METERS (haversine).
 * Nauwkeurig genoeg voor "binnen X meter van een adres"-checks.
 */
export function afstandMeter(a: GeoPunt, b: GeoPunt): number {
  const R = 6_371_000 // straal aarde in meter
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Ligt `punt` binnen `straalMeter` van `referentie`? Null-coördinaten → false. */
export function isBinnenStraal(
  punt: GeoPunt | null | undefined,
  referentie: GeoPunt | null | undefined,
  straalMeter: number,
): boolean {
  if (!punt || !referentie) return false
  if (!Number.isFinite(punt.lat) || !Number.isFinite(punt.lng)) return false
  if (!Number.isFinite(referentie.lat) || !Number.isFinite(referentie.lng)) return false
  return afstandMeter(punt, referentie) <= straalMeter
}

/** Normaliseer een kenteken: hoofdletters, geen spaties, streepjes behouden. */
export function normalizeKenteken(k: string | null | undefined): string {
  if (!k) return ''
  return k.toUpperCase().replace(/\s+/g, '').trim()
}

/**
 * Herkent een buitenlandse locatie op basis van adres-string.
 * Ulu-exports bevatten vaak Engelstalige provincie-namen voor NL
 * (South Holland, North Brabant, Utrecht, Gelderland, ...).
 * Daarom detecteren we buitenland aan expliciete buitenlandse steden/landen.
 */
const BUITENLAND_INDICATOREN = [
  'germany', 'deutschland', 'bavaria', 'north-rhine-westphalia',
  'hesse', 'baden-württemberg', 'saxony', 'rhineland-palatinate',
  'belgium', 'belgique', 'belgië', 'flanders', 'wallonia',
  'france', 'frankrijk',
  'luxembourg',
  'spain', 'spanje', 'italy', 'italië',
  'austria', 'oostenrijk',
  'poland', 'polen',
  'switzerland', 'zwitserland',
  'denmark', 'sweden', 'norway', 'finland',
]

export function isBuitenlandAdres(adres: string | null | undefined): boolean {
  if (!adres) return false
  const lower = adres.toLowerCase()
  return BUITENLAND_INDICATOREN.some((ind) => lower.includes(ind))
}

/** Parseert de ULU-afstand-string (bv. "2,529" of "43,303") naar number in km. */
export function parseUluAfstand(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Parseert "HH:MM:SS" naar seconden. */
export function parseDurationToSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const parts = String(value).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/** Parseert ULU kilometerstand "19.985,427" → 19985.427 */
export function parseUluKmStand(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  // Verwijder duizendtal-punten, vervang decimaal-komma door punt
  const cleaned = String(value).replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}
