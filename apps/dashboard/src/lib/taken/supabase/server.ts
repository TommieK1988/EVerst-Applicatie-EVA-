/**
 * Supabase server client — gebruik in Server Components, Route Handlers en Server Actions
 */
import { createServerClient } from '@supabase/ssr'
import { alsSessieCookie, MOBIEL_MARKER_COOKIE } from '@everts/database/cookies'
import { cookies } from 'next/headers';
import type { Database } from './database.types'

export async function createClient() {
  const cookieStore = await cookies()
  const persistent = !!cookieStore.get(MOBIEL_MARKER_COOKIE)

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // setAll wordt ook aangeroepen vanuit Server Components waar je niet kunt schrijven.
            // Dit is veilig te negeren als je een middleware gebruikt die sessie vernieuwt.
          }
        },
      },
    }
  )
}
