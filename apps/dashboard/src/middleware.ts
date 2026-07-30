import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { alsSessieCookie, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { isMobileUA } from '@/lib/isMobileUA'
import { COOKIE_SESSIE_VERLOOPT, volgendeUitlogTijd, mobieleVervalTijd } from '@/lib/sessie'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Mobiel? Dan krijgt de sessie een persistente 3-daagse levensduur (overleeft
  // een app-herstart); desktop houdt de sessie-cookie die bij het sluiten vervalt.
  // Vroeg bepalen zodat de cookie-schrijver hieronder het al weet.
  const mobiel = isMobileUA(request.headers.get('user-agent'))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            // Desktop: sessie-cookies (vervallen bij sluiten). Mobiel: persistent
            // met Max-Age, zodat de sessie een app-herstart overleeft.
            response.cookies.set(name, value, alsSessieCookie(options, mobiel))
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === '/login'
  const isAuthRoute = pathname.startsWith('/auth/')
  const isApiRoute = pathname.startsWith('/api/')
  // Cron-endpoints beveiligen zichzelf met CRON_SECRET (Bearer) en hebben géén sessiecookie —
  // de cookie-auth mag ze daarom niet naar /login redirecten (anders draait de Vercel-cron nooit).
  const isCronRoute = pathname.startsWith('/api/cron/')
  // Publiek tokenportaal (oplevering): onderaannemer-afmelden, opdrachtgever-akkoord en
  // bewonersfeedback lopen zonder login via /p/<scope>/<token>. Server-side wordt elke actie
  // alsnog met een gehasht token gevalideerd — de route mag daarom publiek zijn.
  const isPubliekPortaal = pathname.startsWith('/p/')
  // Set-wachtwoord na uitnodiging: bereikbaar voor ingelogde gebruikers zonder
  // meteen naar /m gebounced te worden (mobiel én desktop volgen dezelfde link).
  const isWachtwoordRoute = pathname === '/wachtwoord-instellen'
  const isOpMobiel = pathname === '/m' || pathname.startsWith('/m/')

  // Niet ingelogd → doorsturen naar login (behalve login-pagina, auth-callbacks, cron- en portaalroutes)
  if (!user && !isLoginPage && !isAuthRoute && !isCronRoute && !isPubliekPortaal) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // Eén keer per dag uitloggen (server-side handhaving). De vervalcookie wordt
    // bij de eerste request van een sessie gezet en daarna alléén gelézen — verder
    // gebruik schuift het moment dus niet op.
    const verval = request.cookies.get(COOKIE_SESSIE_VERLOOPT)?.value
    const nu = Date.now()
    if (verval) {
      const ts = Number(verval)
      if (Number.isFinite(ts) && nu >= ts) {
        // Vervalmoment voorbij (desktop: einde werkdag; mobiel: 3 dagen na login)
        // → sessie beëindigen en naar login. Dit dekt ook het geval "app heropenen".
        await supabase.auth.signOut()
        const uit = NextResponse.redirect(new URL('/login', request.url))
        // Door signOut gewiste Supabase-cookies meenemen op de redirect …
        response.cookies.getAll().forEach((c) => uit.cookies.set(c))
        // … en de verval- + markercookie opruimen, anders logt de volgende login direct weer uit.
        uit.cookies.set(COOKIE_SESSIE_VERLOOPT, '', { maxAge: 0, path: '/' })
        uit.cookies.set(MOBIEL_MARKER_COOKIE, '', { maxAge: 0, path: '/' })
        return uit
      }
    } else if (!isApiRoute) {
      // Verse login: leg het vervalmoment eenmalig vast. Alleen op paginarequests,
      // zodat een achtergrond-fetch het venster niet stiekem opnieuw opent.
      // Mobiel: absoluut 3 dagen na login, persistent zodat een app-herstart het
      // moment niet reset (= voorwaarde voor de absolute telling). Desktop: het
      // eerstvolgende 18:00 als sessie-cookie, precies zoals voorheen.
      if (mobiel) {
        response.cookies.set(COOKIE_SESSIE_VERLOOPT, String(mobieleVervalTijd()), {
          path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE,
        })
      } else {
        response.cookies.set(COOKIE_SESSIE_VERLOOPT, String(volgendeUitlogTijd()), {
          path: '/', sameSite: 'lax',
        })
      }
    }

    // Markercookie voor de browser-client: zolang dit een mobiele sessie is,
    // schrijft die de auth-cookies persistent i.p.v. als sessie-cookie.
    if (mobiel && !isApiRoute) {
      response.cookies.set(MOBIEL_MARKER_COOKIE, '1', {
        path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE,
      })
    }

    // Al ingelogd en op login → meteen naar de juiste home (mobiel: /m).
    // Server-side beslist zodat de desktop-app niet kort in beeld flitst.
    if (isLoginPage) {
      return NextResponse.redirect(new URL(mobiel ? '/m' : '/', request.url))
    }

    // Telefoon op een desktop-route → server-side naar de mobiele omgeving.
    // (Vervangt de client-side flash; MobileRedirect blijft als viewport-fallback.)
    if (mobiel && !isOpMobiel && !isAuthRoute && !isApiRoute && !isWachtwoordRoute) {
      return NextResponse.redirect(new URL('/m', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match alle routes behalve:
     * - _next/static (statische bestanden)
     * - _next/image (Next.js image optimization)
     * - favicon.ico
     * - publieke bestanden (svg, png, jpg etc.)
     * - PWA-bestanden (manifest.webmanifest, sw.js) — moeten publiek zijn
     *   anders kan de app niet installeren / de service worker niet laden
     * - api/weather en api/nieuws (geen auth vereist, externe data)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|api/weather|api/nieuws|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
