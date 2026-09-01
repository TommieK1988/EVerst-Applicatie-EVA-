import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getAlleContactpersonen } from '@/lib/relaties/contactpersonen-actions'
import { getAlleParticulieren } from '@/lib/relaties/particulieren-actions'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import RelatiesOverzicht from './RelatiesOverzicht'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { Organisatie } from './RelatiesOverzicht'

export const metadata: Metadata = { title: 'Relaties' }

export default async function RelatiesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [relaties, contactpersonenRes, particulierenRes, layouts, laatsteSync] = await Promise.all([
    // Gepagineerd: het relatiebestand groeit richting de 1000 en PostgREST kapt daarna stil af,
    // waardoor organisaties zonder melding uit het overzicht vallen. Zie lib/supabase/paginate.ts.
    haalAlleRijen<Organisatie>((van, tot) => supabase
      .from('relaties')
      .select('id, types, naam, email, telefoon, website, kvk_nummer, btw_nummer, adres_straat, adres_postcode, adres_plaats, adres_land, actief, created_at')
      .order('naam', { ascending: true })
      .order('id')
      .range(van, tot)),
    getAlleContactpersonen(),
    getAlleParticulieren(),
    user_id ? laadLayouts(user_id, 'relaties-organisaties') : [],
    getLaatsteSyncTijd('relaties'),
  ])

  return (
    <RelatiesOverzicht
      organisaties={relaties}
      contactpersonen={contactpersonenRes}
      particulieren={particulierenRes}
      layouts={layouts}
      user_id={user_id}
      laatsteSync={laatsteSync}
    />
  )
}
