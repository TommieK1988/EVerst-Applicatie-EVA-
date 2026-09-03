/**
 * Cookie-helpers die de Supabase-sessie beperken tot de browsersessie.
 *
 * @supabase/ssr forceert een Max-Age van 400 dagen op alle auth-cookies,
 * waardoor gebruikers na een herstart van de browser/app ingelogd blijven.
 * EVA moet bij elke opstart het inlogscherm tonen; daarom strippen we de
 * levensduur zodat de browser de cookies weggooit bij het sluiten.
 * Verwijderingen (maxAge 0) blijven intact, anders raak je cookies nooit kwijt.
 */
import type { CookieOptions } from '@supabase/ssr'

/**
 * Levensduur van een mobiele (persistente) sessie: 3 dagen in seconden.
 * Mobiele gebruikers loggen zo hooguit 1× per 3 dagen opnieuw in i.p.v. dagelijks.
 */
export const MOBIEL_SESSIE_MAXAGE = 60 * 60 * 24 * 3

/**
 * Niet-httpOnly markercookie dat aangeeft dat de huidige sessie een mobiele,
 * persistente sessie is. Gezet bij de mobiele login en ververst door de
 * middleware; gelezen door de cookie-schrijvers (server én browser) om te
 * bepalen of de auth-cookies een echte Max-Age krijgen i.p.v. sessie-cookies.
 */
export const MOBIEL_MARKER_COOKIE = 'eva_mobiel'

/**
 * Levensduur van het apparaat-cookie: een jaar. Het soort apparaat verandert
 * niet, dus dit hoeft niet elke sessie opnieuw vastgesteld te worden.
 */
export const APPARAAT_COOKIE_MAXAGE = 60 * 60 * 24 * 365

/**
 * Niet-httpOnly cookie met het soort apparaat: `mobiel` voor telefoons en
 * tablets, afwezig voor desktops.
 *
 * Nodig omdat een iPad zich sinds iPadOS 13 als Macintosh voorstelt: server-side
 * is hij niet van een MacBook te onderscheiden. De browser stelt het eenmalig
 * vast (touch + schermformaat, zie `lib/mobiel-apparaat.ts`) en legt het hier
 * vast, zodat de middleware er bij elk volgend verzoek al vóór het renderen op
 * kan beslissen -- en de gebruiker dus niet meer heen en weer springt tussen de
 * mobiele en de platformweergave.
 *
 * Alleen routering en cookielevensduur; nooit als autorisatie gebruiken. Wie hem
 * zelf zet krijgt hooguit de mobiele weergave te zien.
 */
export const APPARAAT_COOKIE = 'eva_apparaat'

/**
 * Levensduur van een klantportaal-sessie: 14 dagen. Een opdrachtgever komt niet
 * elke ochtend binnen en zou anders bijna elk bezoek een nieuwe inloglink moeten
 * aanvragen.
 */
export const PORTAAL_SESSIE_MAXAGE = 60 * 60 * 24 * 14

/**
 * Markercookie voor het klantportaal — zelfde rol als {@link MOBIEL_MARKER_COOKIE}:
 * de cookie-schrijvers lezen hem om te bepalen of de auth-cookies persistent
 * moeten zijn. Puur routering en levensduur, nooit autorisatie.
 */
export const PORTAAL_MARKER_COOKIE = 'eva_portaal'

/**
 * Bepaalt de levensduur van een auth-cookie:
 * - `persistent = false` (desktop): sessie-cookie, sterft bij het sluiten van de
 *   browser/app — elke opstart loopt via het inlogscherm.
 * - `persistent = true` (mobiel): vaste Max-Age van {@link MOBIEL_SESSIE_MAXAGE},
 *   zodat de sessie een app-herstart overleeft.
 * Geef `maxAge` mee om een andere levensduur te kiezen (het klantportaal gebruikt
 * {@link PORTAAL_SESSIE_MAXAGE}).
 * Verwijderingen (maxAge 0) blijven altijd intact, anders raak je cookies nooit kwijt.
 */
export function alsSessieCookie(
  options?: CookieOptions,
  persistent = false,
  maxAge: number = MOBIEL_SESSIE_MAXAGE,
): CookieOptions {
  const opts: CookieOptions = { ...(options ?? {}) }
  if (opts.maxAge === 0) return opts
  if (persistent) {
    opts.maxAge = maxAge
    delete opts.expires
    return opts
  }
  delete opts.maxAge
  delete opts.expires
  return opts
}

type CookieToSet = { name: string; value: string; options?: CookieOptions }

function veiligDecoderen(waarde: string): string {
  try {
    return decodeURIComponent(waarde)
  } catch {
    return waarde
  }
}

/**
 * cookies-implementatie voor createBrowserClient. De standaard-implementatie
 * van @supabase/ssr schrijft zelf document.cookie mét Max-Age; deze variant
 * schrijft sessie-cookies (geen Max-Age/Expires, behalve bij verwijderen).
 */
export const browserSessieCookies = {
  getAll(): { name: string; value: string }[] {
    if (typeof document === 'undefined') return []
    return document.cookie
      .split(/; */)
      .filter(Boolean)
      .map((deel) => {
        const scheiding = deel.indexOf('=')
        return {
          name: scheiding >= 0 ? deel.slice(0, scheiding) : deel,
          value: scheiding >= 0 ? veiligDecoderen(deel.slice(scheiding + 1)) : '',
        }
      })
  },
  setAll(cookiesToSet: CookieToSet[]) {
    if (typeof document === 'undefined') return
    // Mobiele sessie of klantportaal? Dan de auth-cookies persistent schrijven
    // (Max-Age), zodat ze een herstart overleven. De markers worden bij de
    // betreffende login gezet.
    const delen = document.cookie.split(/; */)
    const mobiel = delen.some((deel) => deel.startsWith(`${MOBIEL_MARKER_COOKIE}=`))
    const portaal = delen.some((deel) => deel.startsWith(`${PORTAAL_MARKER_COOKIE}=`))
    const persistent = mobiel || portaal
    const levensduur = portaal ? PORTAAL_SESSIE_MAXAGE : MOBIEL_SESSIE_MAXAGE
    for (const { name, value, options } of cookiesToSet) {
      const opts = alsSessieCookie(options, persistent, levensduur)
      let cookie = `${name}=${encodeURIComponent(value)}`
      cookie += `; Path=${opts.path ?? '/'}`
      if (opts.domain) cookie += `; Domain=${opts.domain}`
      if (typeof opts.maxAge === 'number') cookie += `; Max-Age=${opts.maxAge}`
      if (opts.sameSite) {
        const sameSite = opts.sameSite === true ? 'strict' : String(opts.sameSite)
        cookie += `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`
      }
      if (opts.secure) cookie += '; Secure'
      document.cookie = cookie
    }
  },
}
