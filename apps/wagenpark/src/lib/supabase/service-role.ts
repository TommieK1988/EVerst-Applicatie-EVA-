/**
 * Service-role client: omzeilt RLS en wordt gebruikt in server actions
 * voor bulk-imports (ULU trips/parking, RDW refresh).
 * NOOIT naar de browser sturen.
 */
import { createClient as createBase } from '@supabase/supabase-js'

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service-role env-variabelen ontbreken')
  }
  return createBase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
