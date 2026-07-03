import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { DossierLijst } from '@/components/dossiers/DossierLijst'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { SERVICEDESK_STATUSSEN } from '@/components/dossiers/types'
import { getDossiersVoorServicedesk, getDossiersServicedeskArchief, updateServicedeskSubstatus, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
import { getMedewerkerByAuthId } from '@/lib/dashboard/queries'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import { ArchiefToggle } from './ArchiefToggle'

export const metadata: Metadata = { title: 'Servicedesk' }

export default async function ServicedeskPage({
  searchParams,
}: {
  searchParams: Promise<{ archief?: string; mijn?: string }>
}) {
  const sp = await searchParams
  const toonArchief = sp.archief === '1'

  let user_id: string | null = null
  let mijnNaam: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
    if (sp.mijn === '1' && user_id) {
      mijnNaam = medewerkerNaam(await getMedewerkerByAuthId(user_id))
    }
  } catch {
    // niet ingelogd of session unavailable
  }

  if (toonArchief) {
    const [result, layouts, lasteSyncIso] = await Promise.all([
      getDossiersServicedeskArchief(),
      user_id ? laadLayouts(user_id, 'dossiers-servicedesk') : Promise.resolve([]),
      getLastBouw7SyncTijd(),
    ])
    const dossiers = result.ok ? result.data : []

    return (
      <DossierLijst
        sectie="servicedesk"
        statussen={SERVICEDESK_STATUSSEN}
        dossiers={dossiers}
        layouts={layouts}
        user_id={user_id}
        extraActies={
          <div className="flex items-center gap-2">
            <BouwSyncKnop lasteSyncIso={lasteSyncIso} scope="servicedesk" />
            <Suspense fallback={null}>
              <ArchiefToggle />
            </Suspense>
          </div>
        }
      />
    )
  }

  const [result, layouts, lasteSyncIso] = await Promise.all([
    getDossiersVoorServicedesk(),
    user_id ? laadLayouts(user_id, 'dossiers-servicedesk') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  return (
    <DossierViewSwitcher
      sectie="servicedesk"
      statussen={SERVICEDESK_STATUSSEN}
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      mijnNaam={mijnNaam}
      kolomKeyModus="servicedesk_substatus"
      onStatusChange={updateServicedeskSubstatus}
      extraActies={
        <div className="flex items-center gap-2">
          <BouwSyncKnop lasteSyncIso={lasteSyncIso} scope="servicedesk" />
          <Suspense fallback={null}>
            <ArchiefToggle />
          </Suspense>
        </div>
      }
    />
  )
}
