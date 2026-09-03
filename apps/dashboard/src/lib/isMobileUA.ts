/**
 * Bepaalt server-side of een verzoek de mobiele omgeving (`/m`) hoort te krijgen.
 *
 * Wordt gebruikt in de middleware, de auth-callback en de inlogpagina, zodat een
 * mobiele gebruiker vóór het renderen al goed uitkomt — de platformweergave
 * flitst dan nooit kort in beeld.
 *
 * Twee signalen, omdat de User-Agent alléén niet genoeg is:
 *
 * 1. De UA herkent telefoons betrouwbaar, en tablets die zich als tablet
 *    voorstellen (Android-tablets, oudere iPads, iPad in "mobiele site"-stand).
 * 2. Een iPad in de standaardstand stelt zich sinds iPadOS 13 voor als
 *    Macintosh en is server-side niet van een MacBook te onderscheiden. Die
 *    stelt de browser zelf vast en legt hij vast in het apparaat-cookie
 *    (`lib/mobiel-apparaat.ts`); vanaf het tweede verzoek weet de server het dus
 *    ook.
 */
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i

/**
 * Tablets die zichzelf wél kenbaar maken. `Android` zonder `Mobile` is per
 * Google's eigen conventie een tablet; telefoons zetten er altijd `Mobile` bij
 * (en zijn hierboven al afgevangen).
 */
const TABLET_UA = /iPad|Tablet|Kindle|Silk|PlayBook|Android/i

/** Telefoon volgens de User-Agent. */
export function isMobileUA(userAgent: string | null | undefined): boolean {
  return !!userAgent && PHONE_UA.test(userAgent)
}

/** Tablet volgens de User-Agent (niet elke tablet geeft zich zo te kennen). */
export function isTabletUA(userAgent: string | null | undefined): boolean {
  return !!userAgent && !isMobileUA(userAgent) && TABLET_UA.test(userAgent)
}

/**
 * Hoort dit verzoek in de mobiele omgeving? Telefoon of tablet volgens de UA,
 * óf een apparaat dat de browser eerder als mobiel heeft vastgesteld.
 *
 * Geef de waarde van het apparaat-cookie mee (`APPARAAT_COOKIE`); ontbreekt hij,
 * dan telt alleen de UA — precies het gedrag van vóór het cookie.
 */
export function isMobielVerzoek(
  userAgent: string | null | undefined,
  apparaatCookie?: string | null,
): boolean {
  return isMobileUA(userAgent) || isTabletUA(userAgent) || apparaatCookie === 'mobiel'
}
