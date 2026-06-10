/**
 * Tijd-helpers voor compliance-regels.
 * Sync met trigger `tg_ulu_trips_bereken_rit_type` in
 * `supabase/migrations/20260417_wagenpark.sql`.
 */

/** Werktijd-grens bevestigd door gebruiker 17-apr-2026. */
export const WERKTIJD_START_UUR = 7
export const WERKTIJD_EIND_UUR = 17

/** Is `date` een weekenddag (zaterdag of zondag)? */
export function isWeekend(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  const dow = d.getDay() // 0 = zondag, 6 = zaterdag
  return dow === 0 || dow === 6
}

/**
 * Parseert een tijd-string 'HH:MM[:SS]' naar uur als decimaal getal.
 * '07:30' → 7.5
 */
export function parseTimeAsHour(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + (m || 0) / 60
}

/**
 * Bepaalt het berekende rit-type volgens de werktijd-regel (R1).
 *
 * - Weekend → altijd 'prive'
 * - Weekdag 07:00-17:00 → 'zakelijk'
 * - Weekdag buiten die tijden → 'prive'
 *
 * Dit is de enige bron van waarheid in de applicatie; ULU-markering wordt
 * vastgelegd (`rit_type_ulu`) maar niet gebruikt voor compliance-berekeningen.
 */
export function bepaalRitTypeBerekend(
  startDatum: Date | string,
  startTijd: string,
): 'zakelijk' | 'prive' {
  if (isWeekend(startDatum)) return 'prive'
  const hour = parseTimeAsHour(startTijd)
  return hour >= WERKTIJD_START_UUR && hour < WERKTIJD_EIND_UUR
    ? 'zakelijk'
    : 'prive'
}

/** Format HH:MM uit een Date of tijd-string. */
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d.slice(0, 5)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Aantal dagen in de gegeven periode (inclusief beide uiteinden). */
export function daysInPeriod(start: Date | string, end: Date | string): number {
  const s = typeof start === 'string' ? new Date(start) : start
  const e = typeof end === 'string' ? new Date(end) : end
  const ms = e.getTime() - s.getTime()
  return Math.max(1, Math.floor(ms / 86_400_000) + 1)
}
