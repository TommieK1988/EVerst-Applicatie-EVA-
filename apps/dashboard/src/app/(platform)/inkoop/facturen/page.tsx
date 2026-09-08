import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisRecht, heeftModuleToegang } from '@/lib/auth/rechten'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import { getInkoopfacturen } from '@/lib/inkoopfacturen/actions'
import InkoopfacturenOverzicht from './InkoopfacturenOverzicht'

export const metadata: Metadata = { title: 'Inkoopfacturen' }

export default async function InkoopfacturenPage() {
  const { rechten } = await vereisRecht('inkoopfacturen', 'lezen')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [data, layouts, laatsteSync] = await Promise.all([
    getInkoopfacturen(),
    user_id ? laadLayouts(user_id, 'inkoopfacturen') : [],
    getLaatsteSyncTijd('inkoopfacturen'),
  ])

  return (
    <InkoopfacturenOverzicht
      rijen={data.rijen}
      mijnBeurt={data.mijnBeurt}
      allesZien={data.allesZien}
      layouts={layouts}
      user_id={user_id}
      laatsteSync={laatsteSync}
      magAccorderen={heeftModuleToegang(rechten, 'inkoopfacturen', 'schrijven')}
      magBetalen={heeftModuleToegang(rechten, 'inkoopfacturen', 'beheren')}
    />
  )
}
