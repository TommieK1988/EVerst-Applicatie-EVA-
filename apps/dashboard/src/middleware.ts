import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { alsSessieCookie } from '@everts/database/cookies'
import { isMobileUA } from '@/lib/isMobileUA'
import { IDLE_MS, COOKIE_LAATSTE_ACTIVITEIT } from '@/lib/idle'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

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
            // Sessie-cookies: login vervalt bij het sluiten van de browser/app,
            // zodat elke opstart via het inlogscherm loopt.
            response.cookies.set(name, value, alsSessieCookie(options))
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
  const isOpMobiel = pathname === '/m' || pathname.startsWith('/m/')
  const mobiel = isMobileUA(request.headers.get('user-agent'))

  // Niet ingelogd → doorsturen naar login (behalve login-pagina, auth-callbacks, cron- en portaalroutes)
  if (!user && !isLoginPage && !isAuthRoute && !isCronRoute && !isPubliekPortaal) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // Automatisch uitloggen bij inactiviteit (server-side handhaving).
    // De activiteitscookie wordt door de client geschreven bij échte input; hier
    // wordt hij alléén gelézen — niet ververst — zodat achtergrond-requests
    // (polling e.d.) de sessie niet ongemerkt verlengen.
    const laatste = request.cookies.get(COOKIE_LAATSTE_ACTIVITEIT)?.value
    const nu = Date.now()
    if (laatste) {
      const ts = Number(laatste)
      if (Number.isFinite(ts) && nu - ts > IDLE_MS) {
        // Te lang inactief → sessie beëindigen en naar login. Dit dekt ook het
        // geval "URL heropenen": een verlopen tijdstempel logt alsnog uit.
        await supabase.auth.signOut()
        const uit = NextResponse.redirect(new URL('/login', request.url))
        // Door signOut gewiste Supabase-cookies meenemen op de redirect …
        response.cookies.getAll().forEach((c) => uit.cookies.set(c))
        // … en de activiteitscookie opruimen, anders logt de volgende login direct weer uit.
        uit.cookies.set(COOKIE_LAATSTE_ACTIVITEIT, '', { maxAge: 0, path: '/' })
        return uit
      }
    } else if (!isApiRoute) {
      // Nog geen activiteitscookie (verse login): seed op 'nu' zodat een net
      // ingelogde gebruiker niet meteen wordt uitgelogd. Gebeurt eenmalig bij
      // afwezigheid — dus geen sessieverlenging door achtergrond-requests.
      response.cookies.set(COOKIE_LAATSTE_ACTIVITEIT, String(nu), {
        path: '/',
        sameSite: 'lax',
      })
    }

    // Al ingelogd en op login → meteen naar de juiste home (mobiel: /m).
    // Server-side beslist zodat de desktop-app niet kort in beeld flitst.
    if (isLoginPage) {
      return NextResponse.redirect(new URL(mobiel ? '/m' : '/', request.url))
    }

    // Telefoon op een desktop-route → server-side naar de mobiele omgeving.
    // (Vervangt de client-side flash; MobileRedirect blijft als viewport-fallback.)
    if (mobiel && !isOpMobiel && !isAuthRoute && !isApiRoute) {
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
