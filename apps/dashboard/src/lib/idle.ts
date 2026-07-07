/**
 * Gedeelde constanten voor de automatische uitlog bij inactiviteit.
 *
 * Zowel de client-timer (`components/eva/IdleLogout.tsx`) als de server-side
 * handhaving (`middleware.ts`) gebruiken deze waarden, zodat ze niet uit elkaar
 * kunnen lopen.
 */

/** Maximale inactiviteit vóór automatische uitlog (15 minuten). */
export const IDLE_MS = 15 * 60 * 1000

/**
 * Cookie met het tijdstip (ms sinds epoch) van de laatste échte
 * gebruikersactiviteit. Wordt door de client geschreven en door de middleware
 * gelezen. Bewust een sessie-cookie (geen Max-Age): hij leeft en sterft samen
 * met de Supabase-sessiecookies, zodat een verlopen tijdstempel bij het
 * heropenen van de URL alsnog tot uitloggen leidt.
 */
export const COOKIE_LAATSTE_ACTIVITEIT = 'eva_laatste_activiteit'

/** localStorage-sleutel voor cross-tab synchronisatie van de activiteit. */
export const STORAGE_LAATSTE_ACTIVITEIT = 'eva-laatste-activiteit'
