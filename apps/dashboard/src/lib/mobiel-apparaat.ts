/**
 * Apparaatherkenning in de browser: is dit een telefoon of tablet?
 *
 * Bewust géén schermbreedte. Een smal venster op een desktop is geen mobiel
 * apparaat — dat blijft een tijdelijke situatie die alleen zolang het venster
 * smal is naar `/m` uitwijkt (zie `MobileRedirect`). Wat hier `true` oplevert
 * wordt vastgelegd in een cookie van een jaar en bepaalt dus permanent waar
 * iemand terechtkomt; daar horen alleen echte apparaatkenmerken in thuis.
 *
 * De iPad is de reden dat dit client-side moet: sinds iPadOS 13 stelt Safari
 * zich in de standaardstand voor als Macintosh, en die UA is server-side niet
 * van een MacBook te onderscheiden. `maxTouchPoints` verraadt het verschil —
 * een Mac heeft er 0, een iPad 5.
 */
import { APPARAAT_COOKIE, APPARAAT_COOKIE_MAXAGE } from '@everts/database/cookies'

const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i
const TABLET_UA = /iPad|Tablet|Kindle|Silk|PlayBook|Android/i

/**
 * Telefoon of tablet? Op de server (en vóór hydratie) altijd `false`: daar is
 * `navigator` er niet, en de middleware heeft de vraag dan al beantwoord.
 */
export function isMobielApparaat(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent

  if (PHONE_UA.test(ua) || TABLET_UA.test(ua)) return true

  // iPad/iPadOS in de standaardstand: Macintosh-UA met een aanraakscherm.
  // (`maxTouchPoints > 1` en niet `> 0`: een Mac met aangesloten tekentablet
  // meldt er soms één.)
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/**
 * Legt de uitkomst van {@link isMobielApparaat} vast in het apparaat-cookie,
 * zodat de middleware bij het volgende verzoek al vóór het renderen weet waar
 * deze bezoeker heen moet. Op een desktop wordt het cookie juist gewist — zo
 * herstelt een apparaat dat ooit verkeerd is bestempeld zichzelf.
 */
export function bewaarApparaatSoort(): void {
  if (typeof document === 'undefined') return
  const basis = `${APPARAAT_COOKIE}=%s; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  document.cookie = isMobielApparaat()
    ? basis.replace('%s', `mobiel; Max-Age=${APPARAAT_COOKIE_MAXAGE}`)
    : basis.replace('%s', '; Max-Age=0')
}

/**
 * sessionStorage-markering: deze tab week uit naar `/m` puur omdat het venster
 * smaller dan 768px was, niet omdat het een mobiel apparaat is. Zolang die staat
 * mag `DesktopRedirect` terugsturen naar de platformweergave als het venster
 * weer breed wordt. Wie `/m` zélf opent (bijvoorbeeld om de mobiele app te
 * bekijken op een desktop) zet de markering niet en blijft dus gewoon staan.
 */
export const MARKER_SMAL_VENSTER = 'eva-uitgeweken-smal-venster'
