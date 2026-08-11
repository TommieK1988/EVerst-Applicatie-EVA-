/**
 * Het pad waar iemand naartoe wilde voordat hij op het inlogscherm belandde.
 *
 * Waarom dit bestaat: EVA stuurt een verlopen sessie naar `/login` en daarna naar
 * de startpagina. Wie een pushmelding aantikt, een link uit een mail volgt of de
 * QR-code op een bewonersbrief scant, komt zo op het startscherm uit in plaats van
 * bij het onderwerp — en mag dan zelf gaan zoeken.
 *
 * Waarom een validatie en niet gewoon doorgeven: `next` komt uit de URL en is dus
 * door een aanroeper te kiezen. Zonder controle is dat een open redirect — een
 * link naar het echte EVA-inlogscherm die je na het inloggen naar een andere site
 * stuurt, wat precies de vorm is die phishing prettig vindt. Daarom uitsluitend
 * paden binnen EVA zelf.
 */

/** Stuurtekens (incl. regelovergangen) horen niet in een pad. */
const STUURTEKENS = /[\u0000-\u001F\u007F]/

/**
 * Geeft het pad terug als het veilig binnen EVA blijft, anders null.
 *
 * Afgekeurd: alles wat geen `/` als eerste teken heeft (absolute URL's, `javascript:`),
 * en `//host` of `/\host` — die vormen zien er uit als een pad maar worden door de
 * browser als een adres op een ándere host gelezen.
 */
export function veiligNextPad(waarde: string | null | undefined): string | null {
  if (!waarde) return null
  if (waarde.length > 512) return null
  if (waarde[0] !== '/') return null
  if (waarde[1] === '/' || waarde[1] === '\\') return null
  if (STUURTEKENS.test(waarde)) return null
  return waarde
}

/**
 * Maakt van een pad de `?next=`-parameter voor het inlogscherm. Geeft een lege
 * string voor bestemmingen waar het inloggen je toch al brengt — dan is de
 * parameter alleen ruis in de adresbalk.
 */
export function nextParameter(pad: string): string {
  if (!veiligNextPad(pad)) return ''
  if (pad === '/' || pad === '/m' || pad.startsWith('/login')) return ''
  return `?next=${encodeURIComponent(pad)}`
}
