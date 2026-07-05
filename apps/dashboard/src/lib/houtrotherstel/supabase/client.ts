import { createBrowserClient } from '@supabase/ssr'
import { browserSessieCookies } from '@everts/database/cookies'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: browserSessieCookies }
  )
}
