import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { getDossiersVoorServicedesk, updateServicedeskSubstatus, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
import { getMedewerkerByAuthId } from '@/lib/dashboard/queries'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import { ServicedeskBord } from './ServicedeskBord'
import { SERVICEDESK_FILTER_COOKIE, filterUitCookie } from '@/components/dossiers/types'

export const metadata: Metadata = { title: 'Servicedesk' }

/**
 * Vervallen bonnen (EVA-stand Vervallen of Bouw7 '08. Afgewezen') staan niet op dit bord maar
 * onder Afgesloten. Tot oktober 2026 had het bord daar een eigen archiefweergave voor.
 */
export default async function ServicedeskPage({
  searchParams,
}: {
  searchParams: Promise<{ mijn?: string }>
}) {
  const sp = await searchParams

  // Het filter dat de gebruiker het laatst koos. Uit het cookie zodat de eerste render meteen
  // klopt in plaats van eerst "Alle" te laten flitsen.
  const initieelFilter = filterUitCookie((await cookies()).get(SERVICEDESK_FILTER_COOKIE)?.value)

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
    getDossiersVoorServicedesk(),
    user_id ? laadLayouts(user_id, 'dossiers-servicedesk') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  // Het filter Dagelijks onderhoud / Mutatie zit in ServicedeskBord: alles komt uit dezelfde
  // query, dus omschakelen hoeft geen serverronde te kosten.
  return (
    <ServicedeskBord
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      mijnNaam={mijnNaam}
      initieelFilter={initieelFilter}
      onStatusChange={updateServicedeskSubstatus}
      extraActies={<BouwSyncKnop lasteSyncIso={lasteSyncIso} scope="servicedesk" />}
    />
  )
}
