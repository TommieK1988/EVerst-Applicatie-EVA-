import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { BouwSyncKnop } from '@/components/dossiers/BouwSyncKnop'
import { SubstatusAutoVervers } from '@/components/dossiers/SubstatusAutoVervers'
import { AANVRAAG_STATUSSEN } from '@/components/dossiers/types'
import { getDossiersVoorAanvragen, getLastBouw7SyncTijd } from '@/lib/dossiers/actions'
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

  const wmClient = (await createServerClient()) as any
  const [result, werkmaatschappijenRes, layouts, lasteSyncIso] = await Promise.all([
    getDossiersVoorAanvragen(),
    wmClient.from('bedrijfsgegevens').select('id, naam, code').eq('type', 'werkmaatschappij').order('naam'),
    user_id ? laadLayouts(user_id, 'dossiers-aanvraag') : Promise.resolve([]),
    getLastBouw7SyncTijd(),
  ])
  const dossiers = result.ok ? result.data : []
  const werkmaatschappijen = (werkmaatschappijenRes?.data ?? []) as { id: string; naam: string; code: string | null }[]

  return (
    <>
      {/* Verse stand van het gedeelde Bouw7-substatusveld ophalen bij openen (de tweede app schrijft
          hetzelfde veld en kan niet op de cron wachten). */}
      <SubstatusAutoVervers scope="aanvraag" />
      <DossierViewSwitcher
        sectie="aanvraag"
        statussen={AANVRAAG_STATUSSEN}
        dossiers={dossiers}
        layouts={layouts}
        user_id={user_id}
        mijnNaam={mijnNaam}
        kanNieuwAanmaken
        toonSoortSlicer
        werkmaatschappijen={werkmaatschappijen}
        extraActies={<BouwSyncKnop key="bouw7-sync" lasteSyncIso={lasteSyncIso} scope="aanvraag" />}
      />
    </>
  )
}
