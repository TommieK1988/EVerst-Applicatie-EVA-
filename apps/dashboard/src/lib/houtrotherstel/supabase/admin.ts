import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client gescoped op het `houtrotherstel`-schema.
 *
 * Bestond nog niet: `createAdminClient()` uit `@everts/database/server` zet geen
 * `db.schema` en komt dus alleen bij `public`, en de bestaande houtrot-services
 * gebruiken de browserclient. Voor server-side lezen (documentgeneratie) is dit
 * het enige pad.
 *
 * Bewust service-role en niet de cookie-client uit `./server`: de aanroepende
 * routes doen hun eigen rechtencheck, en met de cookie-client zou een gebruiker
 * die niet door `is_platform_gebruiker()` komt een stilzwijgend leeg rapport
 * krijgen in plaats van een fout. Gevolg: `.eq('dossier_id', …)` is de enige
 * scoping en hoort altijd in de query zelf.
 */
export function createHoutrotAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'houtrotherstel' }, auth: { persistSession: false } },
  )
}
