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

export function alsSessieCookie(options?: CookieOptions): CookieOptions {
  const opts: CookieOptions = { ...(options ?? {}) }
  if (opts.maxAge !== 0) {
    delete opts.maxAge
    delete opts.expires
  }
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
    for (const { name, value, options } of cookiesToSet) {
      const opts = alsSessieCookie(options)
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
