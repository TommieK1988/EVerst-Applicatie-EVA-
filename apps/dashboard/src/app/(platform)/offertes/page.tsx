import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { SubstatusAutoVervers } from '@/components/dossiers/SubstatusAutoVervers'
import { OFFERTE_STATUSSEN } from '@/components/dossiers/types'
import { getDossiersVoorOffertes, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'

export const metadata: Metadata = { title: 'Offertes' }

export default async function OffertesPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [result, layouts, lasteSyncIso] = await Promise.all([
    getDossiersVoorOffertes(),
    user_id ? laadLayouts(user_id, 'dossiers-offerte') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  return (
    <>
      {/* Verse stand van het gedeelde Bouw7-substatusveld ophalen bij openen (de tweede app schrijft
          hetzelfde veld en kan niet op de cron wachten). */}
      <SubstatusAutoVervers scope="offerte" />
      <DossierViewSwitcher
        sectie="offerte"
        statussen={OFFERTE_STATUSSEN}
        dossiers={dossiers}
        layouts={layouts}
        user_id={user_id}
        extraActies={<BouwSyncKnop key="bouw7-sync" lasteSyncIso={lasteSyncIso} scope="offerte" />}
      />
    </>
  )
}
