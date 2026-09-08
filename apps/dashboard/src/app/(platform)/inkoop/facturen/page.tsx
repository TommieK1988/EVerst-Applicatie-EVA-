import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisRecht, heeftModuleToegang } from '@/lib/auth/rechten'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import { getInkoopfacturen, getBetaalrondes } from '@/lib/inkoopfacturen/actions'
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

  const magBetaalronde = heeftModuleToegang(rechten, 'inkoopfacturen', 'beheren')

  const [data, layouts, laatsteSync, betaalrondes] = await Promise.all([
    getInkoopfacturen(),
    user_id ? laadLayouts(user_id, 'inkoopfacturen') : [],
    getLaatsteSyncTijd('inkoopfacturen'),
    magBetaalronde ? getBetaalrondes() : Promise.resolve([]),
  ])

  return (
    <InkoopfacturenOverzicht
      rijen={data.rijen}
      mijnBeurt={data.mijnBeurt}
      allesZien={data.allesZien}
      betaalrondes={betaalrondes}
      layouts={layouts}
      user_id={user_id}
      laatsteSync={laatsteSync}
      magAccorderen={heeftModuleToegang(rechten, 'inkoopfacturen', 'schrijven')}
      magBetaalronde={magBetaalronde}
    />
  )
}
