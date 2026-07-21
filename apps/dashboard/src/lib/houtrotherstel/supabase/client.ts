import { createBrowserClient } from '@supabase/ssr'
import { browserSessieCookies } from '@everts/database/cookies'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Houtrot-tabellen leven in het aparte `houtrotherstel`-schema (net als de
    // standalone-app). Zonder dit querieert de client `public.*` — daar staan de
    // tabellen niet, waardoor reads leeg terugkwamen en writes op localStorage vielen.
    { cookies: browserSessieCookies, db: { schema: 'houtrotherstel' } }
  )
}
