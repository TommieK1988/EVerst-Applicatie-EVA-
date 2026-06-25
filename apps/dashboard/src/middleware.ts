import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isMobileUA } from '@/lib/isMobileUA'

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
            response.cookies.set(name, value, options)
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
  const isOpMobiel = pathname === '/m' || pathname.startsWith('/m/')
  const mobiel = isMobileUA(request.headers.get('user-agent'))

  // Niet ingelogd → doorsturen naar login (behalve login-pagina, auth-callbacks en cron-endpoints)
  if (!user && !isLoginPage && !isAuthRoute && !isCronRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
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
