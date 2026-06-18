/**
 * Server-side mobiel-detectie op basis van de User-Agent.
 *
 * Wordt gebruikt in de middleware en de auth-callback om telefoon-gebruikers
 * vóór het renderen al naar de mobiele omgeving (`/m`) te sturen — zo flitst
 * de desktop-app nooit kort in beeld na het inloggen.
 *
 * Bewust telefoon-gericht (geen iPad: die rapporteert een desktop-UA en krijgt
 * de gewone app). Smalle desktop-vensters/tablets vangt de viewport-gebaseerde
 * `MobileRedirect` client-side op als aanvulling.
 */
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i

export function isMobileUA(userAgent: string | null | undefined): boolean {
  return !!userAgent && PHONE_UA.test(userAgent)
}
