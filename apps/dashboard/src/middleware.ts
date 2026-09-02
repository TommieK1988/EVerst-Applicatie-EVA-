import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { alsSessieCookie, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { isMobileUA } from '@/lib/isMobileUA'
import {
  COOKIE_SESSIE_VERLOOPT, COOKIE_PORTAAL, PORTAAL_SESSIE_MAXAGE,
  volgendeUitlogTijd, mobieleVervalTijd, portaalVervalTijd,
} from '@/lib/sessie'
import { nextParameter, veiligNextPad, veiligPortaalPad } from '@/lib/auth/next-pad'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Mobiel? Dan krijgt de sessie een persistente 3-daagse levensduur (overleeft
  // een app-herstart); desktop houdt de sessie-cookie die bij het sluiten vervalt.
  // Vroeg bepalen zodat de cookie-schrijver hieronder het al weet.
  const mobiel = isMobileUA(request.headers.get('user-agent'))

  // Klantportaal-sessie? Die is persistent met een eigen levensduur (14 dagen),
  // ook op de desktop: een opdrachtgever heeft geen werkdag die om 18:00 eindigt
  // en zou anders bij elk bezoek een nieuwe inloglink moeten aanvragen.
  const portaalSessie = request.cookies.get(COOKIE_PORTAAL)?.value === '1'

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
            response.cookies.set(
              name, value,
              alsSessieCookie(
                options,
                mobiel || portaalSessie,
                portaalSessie ? PORTAAL_SESSIE_MAXAGE : undefined,
              ),
            )
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
  // Klantportaal: opdrachtgevers loggen in op /portaal met hun eigen account.
  // Let op: de `/p/`-check hierboven raakt dit niet — '/portaal' begint niet met
  // '/p/'. Een klant is wél ingelogd, maar is géén medewerker; de scheiding
  // tussen beide werelden zit verder in de guards, niet hier.
  const isPortaal = pathname === '/portaal' || pathname.startsWith('/portaal/')
  const isPortaalAuth = pathname === '/portaal/login' || pathname.startsWith('/portaal/auth/')
  // Set-wachtwoord na uitnodiging: bereikbaar voor ingelogde gebruikers zonder
  // meteen naar /m gebounced te worden (mobiel én desktop volgen dezelfde link).
  const isWachtwoordRoute = pathname === '/wachtwoord-instellen'
  const isOpMobiel = pathname === '/m' || pathname.startsWith('/m/')

  // Waar wilde deze request naartoe? Gaat als ?next= mee naar het inlogscherm,
  // zodat een aangetikte pushmelding of een link uit een mail ná het inloggen
  // alsnog op de juiste plek uitkomt in plaats van op de startpagina. Alleen voor
  // paginarequests: een achtergrond-fetch is geen bestemming.
  const bestemming = isApiRoute ? '' : nextParameter(pathname + request.nextUrl.search)

  // Niet ingelogd → doorsturen naar login (behalve login-pagina, auth-callbacks, cron- en portaalroutes).
  // Een bezoeker van het klantportaal hoort op het klant-inlogscherm te landen,
  // niet op dat van EVA: daar kan hij toch niet inloggen.
  if (!user && !isLoginPage && !isAuthRoute && !isCronRoute && !isPubliekPortaal && !isPortaalAuth) {
    const naar = isPortaal ? '/portaal/login' : '/login'
    return NextResponse.redirect(new URL(`${naar}${bestemming}`, request.url))
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
        // Vervalmoment voorbij (desktop: einde werkdag; mobiel: 3 dagen na login;
        // klantportaal: 14 dagen) → sessie beëindigen en naar het bijbehorende
        // inlogscherm. Dit dekt ook het geval "app heropenen".
        await supabase.auth.signOut()
        // Ook hier de bestemming meegeven: dit is juist het geval waarin iemand
        // een melding aantikt terwijl zijn sessie net verlopen is.
        const naarLogin = portaalSessie || isPortaal ? '/portaal/login' : '/login'
        const uit = NextResponse.redirect(new URL(`${naarLogin}${bestemming}`, request.url))
        // Door signOut gewiste Supabase-cookies meenemen op de redirect …
        response.cookies.getAll().forEach((c) => uit.cookies.set(c))
        // … en de verval- + markercookies opruimen, anders logt de volgende login direct weer uit.
        uit.cookies.set(COOKIE_SESSIE_VERLOOPT, '', { maxAge: 0, path: '/' })
        uit.cookies.set(MOBIEL_MARKER_COOKIE, '', { maxAge: 0, path: '/' })
        // De portaalmarker blijft bewust stáán: die zegt alleen "deze browser
        // hoort bij het klantportaal" en zorgt dat de volgende login weer op het
        // juiste scherm uitkomt.
        return uit
      }
    } else if (!isApiRoute) {
      // Verse login: leg het vervalmoment eenmalig vast. Alleen op paginarequests,
      // zodat een achtergrond-fetch het venster niet stiekem opnieuw opent.
      // Mobiel: absoluut 3 dagen na login, persistent zodat een app-herstart het
      // moment niet reset (= voorwaarde voor de absolute telling). Desktop: het
      // eerstvolgende 18:00 als sessie-cookie, precies zoals voorheen.
      if (portaalSessie) {
        response.cookies.set(COOKIE_SESSIE_VERLOOPT, String(portaalVervalTijd()), {
          path: '/', sameSite: 'lax', maxAge: PORTAAL_SESSIE_MAXAGE,
        })
      } else if (mobiel) {
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
    if (mobiel && !isApiRoute && !portaalSessie) {
      response.cookies.set(MOBIEL_MARKER_COOKIE, '1', {
        path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE,
      })
    }

    // Portaalmarker verversen zodat hij niet halverwege een lopende sessie
    // verloopt; dan zouden de auth-cookies ineens weer sessie-cookies worden.
    if (portaalSessie && !isApiRoute) {
      response.cookies.set(COOKIE_PORTAAL, '1', {
        path: '/', sameSite: 'lax', maxAge: PORTAAL_SESSIE_MAXAGE,
      })
    }

    // Al ingelogd en op login → meteen naar de juiste home (mobiel: /m), of naar
    // de bestemming die in ?next= is meegegeven.
    // Server-side beslist zodat de desktop-app niet kort in beeld flitst.
    // Op het klant-inlogscherm terwijl je al ingelogd bent → door naar het portaal.
    // De bestemming blijft binnen /portaal: een klant hoort nooit in EVA te landen.
    if (pathname === '/portaal/login') {
      const gevraagd = veiligPortaalPad(request.nextUrl.searchParams.get('next'))
      return NextResponse.redirect(new URL(gevraagd ?? '/portaal', request.url))
    }

    if (isLoginPage) {
      const gevraagd = veiligNextPad(request.nextUrl.searchParams.get('next'))
      // De markercookie zegt alleen wélke van de twee werelden je het laatst
      // gebruikte; hij is routering, géén autorisatie. Wie hem vervalst komt
      // hooguit op een pagina uit die hem alsnog wegstuurt.
      const isKlant = request.cookies.get(COOKIE_PORTAAL)?.value === '1'
      const standaard = isKlant ? '/portaal' : (mobiel ? '/m' : '/')
      return NextResponse.redirect(new URL(gevraagd ?? standaard, request.url))
    }

    // Telefoon op een desktop-route → server-side naar de mobiele omgeving.
    // (Vervangt de client-side flash; MobileRedirect blijft als viewport-fallback.)
    //
    // Het portaal is hiervan uitgezonderd: /m is de monteursapp en heeft voor een
    // opdrachtgever niets te bieden. Zonder deze uitzondering belandt élke klant
    // die op zijn telefoon een link uit onze mail opent in de verkeerde app.
    if (mobiel && !isOpMobiel && !isAuthRoute && !isApiRoute && !isWachtwoordRoute && !isPortaal) {
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
