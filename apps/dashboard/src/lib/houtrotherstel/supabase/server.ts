import { createServerClient } from '@supabase/ssr'
import { alsSessieCookie } from '@everts/database/cookies'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
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
            // setAll kan worden aangeroepen vanuit Server Components
            // Kan genegeerd worden als je middleware voor sessie verversing gebruikt
          }
        },
      },
    }
  )
}
