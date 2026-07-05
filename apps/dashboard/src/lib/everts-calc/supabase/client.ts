/**
 * Supabase browser client — gebruik in Client Components ('use client')
 */
import { createBrowserClient } from '@supabase/ssr'
import { browserSessieCookies } from '@everts/database/cookies'
import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: browserSessieCookies }
  )
}
