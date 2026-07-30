/**
 * Supabase server client — gebruik in Server Components, Route Handlers en Server Actions.
 */
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers';
import type { Database } from './database.types'
import { alsSessieCookie, MOBIEL_MARKER_COOKIE } from './cookies'

/**
 * Client met anon key + user-sessie (RLS actief).
 *
 * `persistentSessie` forceert een mobiele (persistente) sessie ongeacht de
 * markercookie — nodig bij de login-callback, waar de marker nog niet in de
 * inkomende cookies staat maar de auth-cookies wél al persistent moeten zijn.
 * Zonder deze optie volgt de persistentie de {@link MOBIEL_MARKER_COOKIE}.
 */
export async function createClient(opts?: { persistentSessie?: boolean }) {
  const cookieStore = await cookies()
  const persistent = opts?.persistentSessie ?? !!cookieStore.get(MOBIEL_MARKER_COOKIE)

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
          }
        },
      },
    }
  )
}

/** Client met service_role key — bypast RLS. Alleen gebruiken in server actions. */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
