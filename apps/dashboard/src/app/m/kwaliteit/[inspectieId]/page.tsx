import { notFound } from 'next/navigation'
import AppHeader from '@/components/mobiel/AppHeader'
import KwaliteitRonde from '@/components/mobiel/kwaliteit/KwaliteitRonde'
import { getInspectie } from '@/lib/kwaliteit/inspecties'
import { getDisciplinesMetAantal } from '@/lib/kwaliteit/bibliotheek'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { heeftProjectrol } from '@/lib/dossiers/guards'

export const metadata = { title: 'Kwaliteitsronde · EVA Mobiel' }

/**
 * Het uitvoerscherm van de kwaliteitsronde.
 *
 * Staat bewust op `/m/kwaliteit/[inspectieId]` en niet onder `/m/dossiers/[id]/...`: een statische
 * map onder `[id]` wint in de App Router van het dynamische `[tab]`-segment en maakt die tab
 * onbereikbaar — dezelfde reden als bij `/m/oplevering/[momentId]`.
 *
 * Deeplink-guard: wie de inspectie niet zelf uitvoert, moet een projectrol op het dossier hebben.
 * Een geraden id opent zo geen vreemd project.
 */
export default async function MobielKwaliteitRondePage({
  params,
}: {
  params: Promise<{ inspectieId: string }>
}) {
  const { inspectieId } = await params

  const [context, disciplines, medewerker] = await Promise.all([
    getInspectie(inspectieId),
    getDisciplinesMetAantal(),
    getCurrentMedewerker(),
  ])
  if (!context) notFound()
  if (!medewerker) notFound()

  const eigenRonde = context.inspectie.inspecteur_id === medewerker.id
  if (!eigenRonde) {
    const rol = await heeftProjectrol(context.dossier.id, medewerker.id)
    if (!rol) notFound()
  }

  return (
    <>
      <AppHeader
        title="Kwaliteitsronde"
        sub={`${context.inspectie.inspectienummer} · ${context.dossier.titel}`}
        backHref="/m/taken"
      />
      <KwaliteitRonde context={context} disciplines={disciplines} />
    </>
  )
}
