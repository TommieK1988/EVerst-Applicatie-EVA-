import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { getDossiersVoorServicedesk, getDossiersServicedeskArchief, updateServicedeskSubstatus, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
import { getMedewerkerByAuthId } from '@/lib/dashboard/queries'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import { ArchiefToggle } from './ArchiefToggle'
import { ServicedeskBord } from './ServicedeskBord'
import { SERVICEDESK_LADDER_COOKIE, ladderUitCookie } from '@/components/dossiers/types'

export const metadata: Metadata = { title: 'Servicedesk' }

export default async function ServicedeskPage({
  searchParams,
}: {
  searchParams: Promise<{ archief?: string; mijn?: string }>
}) {
  const sp = await searchParams
  const toonArchief = sp.archief === '1'

  // Waar de gebruiker het laatst stond. Uit het cookie zodat de eerste render al de goede kant
  // toont in plaats van eerst Dagelijks onderhoud te laten flitsen.
  const initieleLadder = ladderUitCookie((await cookies()).get(SERVICEDESK_LADDER_COOKIE)?.value)

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

  const [result, layouts, lasteSyncIso] = await Promise.all([
    toonArchief ? getDossiersServicedeskArchief() : getDossiersVoorServicedesk(),
    user_id ? laadLayouts(user_id, 'dossiers-servicedesk') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  // De splitsing Dagelijks onderhoud / Mutatie zit in ServicedeskBord: beide kanten komen uit
  // dezelfde query, dus omschakelen hoeft geen serverronde te kosten.
  return (
    <ServicedeskBord
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      mijnNaam={toonArchief ? null : mijnNaam}
      initieleLadder={initieleLadder}
      archief={toonArchief}
      onStatusChange={toonArchief ? undefined : updateServicedeskSubstatus}
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
