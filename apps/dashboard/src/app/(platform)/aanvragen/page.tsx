import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { AANVRAAG_STATUSSEN } from '@/components/dossiers/types'
import { getDossiersVoorAanvragen, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
import { getDossierCategorieen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { getMedewerkerByAuthId } from '@/lib/dashboard/queries'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
export const metadata: Metadata = { title: 'Aanvragen' }

export default async function AanvragenPage({
  searchParams,
}: {
  searchParams: Promise<{ mijn?: string }>
}) {
  const sp = await searchParams

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

  const [result, categorieen, layouts, lasteSyncIso] = await Promise.all([
    getDossiersVoorAanvragen(),
    getDossierCategorieen(),
    user_id ? laadLayouts(user_id, 'dossiers-aanvraag') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []

  return (
    <DossierViewSwitcher
      sectie="aanvraag"
      statussen={AANVRAAG_STATUSSEN}
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      mijnNaam={mijnNaam}
      kanNieuwAanmaken
      categorieen={categorieen}
      extraActies={<BouwSyncKnop key="bouw7-sync" lasteSyncIso={lasteSyncIso} />}
    />
  )
}
