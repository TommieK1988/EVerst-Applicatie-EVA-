/**
 * Supabase browser client — gebruik in Client Components ('use client').
 */
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { browserSessieCookies } from './cookies'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Sessie-cookies: bij het sluiten van de browser/app vervalt de login,
    // zodat elke opstart via het inlogscherm loopt.
    { cookies: browserSessieCookies }
  )
}
