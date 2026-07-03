import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getAlleContactpersonen } from '@/lib/relaties/contactpersonen-actions'
import { getAlleParticulieren } from '@/lib/relaties/particulieren-actions'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import RelatiesOverzicht from './RelatiesOverzicht'

export const metadata: Metadata = { title: 'Relaties' }

export default async function RelatiesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [relatiesRes, contactpersonenRes, particulierenRes, layouts, laatsteSync] = await Promise.all([
    supabase
      .from('relaties')
      .select('id, types, naam, email, telefoon, website, kvk_nummer, btw_nummer, adres_straat, adres_postcode, adres_plaats, adres_land, actief, created_at')
      .order('naam', { ascending: true }),
    getAlleContactpersonen(),
    getAlleParticulieren(),
    user_id ? laadLayouts(user_id, 'relaties-organisaties') : [],
    getLaatsteSyncTijd('relaties'),
  ])

  return (
    <RelatiesOverzicht
      organisaties={relatiesRes.data ?? []}
      contactpersonen={contactpersonenRes}
      particulieren={particulierenRes}
      layouts={layouts}
      user_id={user_id}
      laatsteSync={laatsteSync}
    />
  )
}
