import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisModuleToegang, getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang, isBeheerder } from '@/lib/auth/rechten-shared'
import { getDebiteuren, getRedencodes, getMedewerkerOpties } from '@/lib/debiteuren/actions'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import DebiteurenOverzicht from './DebiteurenOverzicht'

export const metadata: Metadata = { title: 'Facturen — Debiteuren' }

export default async function FacturenPage() {
  await vereisModuleToegang('financieel')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch { /* geen sessie */ }

  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker)
  const magBewerken = isBeheerder(rechten) || heeftModuleToegang(rechten, 'financieel', 'schrijven')

  const [debiteuren, redencodes, medewerkers, layouts, laatsteSync] = await Promise.all([
    getDebiteuren(),
    getRedencodes(),
    getMedewerkerOpties(),
    user_id ? laadLayouts(user_id, 'debiteuren') : Promise.resolve([]),
    getLaatsteSyncTijd('debiteuren'),
  ])

  return (
    <DebiteurenOverzicht
      debiteuren={debiteuren}
      redencodes={redencodes}
      medewerkers={medewerkers}
      layouts={layouts}
      user_id={user_id}
      currentMedewerkerId={medewerker?.id ?? null}
      magBewerken={magBewerken}
      defaultScopeAlle={magBewerken}
      laatsteSync={laatsteSync}
    />
  )
}
