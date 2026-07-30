import { createServerClient } from '@supabase/ssr'
import { alsSessieCookie, MOBIEL_MARKER_COOKIE } from '@everts/database/cookies'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const persistent = !!cookieStore.get(MOBIEL_MARKER_COOKIE)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Houtrot-tabellen leven in het aparte `houtrotherstel`-schema (net als de
      // standalone-app). Zonder dit querieert de client `public.*` — daar staan de
      // tabellen niet, waardoor reads leeg terugkwamen en writes op localStorage vielen.
      db: { schema: 'houtrotherstel' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, alsSessieCookie(options, persistent))
            )
          } catch {
            // setAll kan worden aangeroepen vanuit Server Components
            // Kan genegeerd worden als je middleware voor sessie verversing gebruikt
          }
        },
      },
    }
  )
}
