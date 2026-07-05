/**
 * Supabase server client — gebruik in Server Components, Route Handlers en Server Actions
 */
import { createServerClient } from '@supabase/ssr'
import { alsSessieCookie } from '@everts/database/cookies'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import type { Database } from './database.types'

export function createClient() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies)

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
              cookieStore.set(name, value, alsSessieCookie(options))
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
