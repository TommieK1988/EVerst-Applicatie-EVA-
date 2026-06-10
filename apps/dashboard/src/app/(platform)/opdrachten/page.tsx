import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { DossierLijst } from '@/components/dossiers/DossierLijst'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { OPDRACHT_KANBAN_STATUSSEN, OPDRACHT_STATUSSEN } from '@/components/dossiers/types'
import { getDossiersByBouw7Prefix, getDossiersAfgesloten, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
import { AfgeslotenToggle } from './AfgeslotenToggle'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Opdrachten' }

export default async function OpdrachtenPage({
  searchParams,
}: {
  searchParams: Promise<{ afgesloten?: string }>
}) {
  const sp = await searchParams
  const toonAfgesloten = sp.afgesloten === '1'

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  if (toonAfgesloten) {
    const [result, layouts, lasteSyncIso] = await Promise.all([
      getDossiersAfgesloten(),
      user_id ? laadLayouts(user_id, 'dossiers-opdracht') : Promise.resolve([]),
      getLastBouw7SyncTijd(),
    ])
    const dossiers = result.ok ? result.data : []

    return (
      <DossierLijst
        sectie="opdracht"
        statussen={OPDRACHT_STATUSSEN}
        dossiers={dossiers}
        layouts={layouts}
        user_id={user_id}
        extraActies={
          <div className="flex items-center gap-2">
            <BouwSyncKnop lasteSyncIso={lasteSyncIso} />
            <Suspense fallback={null}>
              <AfgeslotenToggle />
            </Suspense>
          </div>
        }
      />
    )
  }

  const [result, layouts, lasteSyncIso] = await Promise.all([
    getDossiersByBouw7Prefix(['02.', '03.', '04.', '05.', '06.'], 'opdracht'),
    user_id ? laadLayouts(user_id, 'dossiers-opdracht') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  return (
    <DossierViewSwitcher
      sectie="opdracht"
      statussen={OPDRACHT_KANBAN_STATUSSEN}
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      extraActies={
        <div className="flex items-center gap-2">
          <BouwSyncKnop lasteSyncIso={lasteSyncIso} />
          <Suspense fallback={null}>
            <AfgeslotenToggle />
          </Suspense>
        </div>
      }
    />
  )
}
