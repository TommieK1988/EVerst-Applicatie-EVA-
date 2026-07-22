import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getDossierOplevering, getOpleverToewijsbaar } from '@/lib/dossiers/oplevering'
import { heeftProjectrol } from '@/lib/dossiers/guards'
import AppHeader from '@/components/mobiel/AppHeader'
import OpleverDoorloop from '@/components/mobiel/oplevering/OpleverDoorloop'

export const metadata = { title: 'Oplevering · EVA Mobiel' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Uitvoerscherm van één oplevermoment.
 *
 * LET OP — deze route staat bewust op `/m/oplevering/[momentId]` en niet onder
 * `/m/dossiers/[id]/oplevering/...`: een statische map `oplevering` onder `[id]` wint in de App
 * Router van het dynamische `[tab]`-segment, waardoor de Oplevering-tab zelf onbereikbaar zou
 * worden. Zelfde opzet als `/m/uren/[id]` en `/m/toolbox/[toewijzingId]`.
 */
export default async function MobielOpleverMomentPage(
  { params }: { params: Promise<{ momentId: string }> }
) {
  const { momentId } = await params

  const { data: moment } = await db()
    .from('oplever_momenten').select('id, dossier_id, titel').eq('id', momentId).maybeSingle()
  if (!moment) notFound()

  // Deeplink-guard: de mobiele dossierlijst toont alleen je eigen dossiers, maar deze route draait
  // op de admin-client. Zonder deze check opent een geraden id elk oplevermoment in het bedrijf.
  const medewerker = await getCurrentMedewerker()
  if (!(await heeftProjectrol(moment.dossier_id, medewerker?.id))) {
    redirect(`/m/dossiers/${moment.dossier_id}/informatie`)
  }

  const [data, toewijsbaar] = await Promise.all([
    getDossierOplevering(moment.dossier_id),
    getOpleverToewijsbaar().catch(() => ({ medewerkers: [], relaties: [] })),
  ])
  const view = data.momenten.find(m => m.id === momentId)
  if (!view) notFound()

  const naam = [medewerker?.voornaam, medewerker?.tussenvoegsel, medewerker?.achternaam].filter(Boolean).join(' ')

  return (
    <>
      <AppHeader
        title={view.titel}
        sub={`${view.aantalGeaccepteerd} van ${view.aantalTotaal} geaccepteerd`}
        backHref={`/m/dossiers/${moment.dossier_id}/oplevering`}
      />
      <OpleverDoorloop
        moment={view}
        dossierId={moment.dossier_id}
        toewijsbaar={toewijsbaar}
        standaardNaam={naam}
      />
    </>
  )
}
