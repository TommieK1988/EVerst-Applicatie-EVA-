import { notFound } from 'next/navigation'
import AppHeader from '@/components/mobiel/AppHeader'
import BezoekDoorloop from '@/components/mobiel/bezoek/BezoekDoorloop'
import { getBezoek } from '@/lib/bezoek/bezoeken'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { heeftProjectrol } from '@/lib/dossiers/guards'
import { bezoekKenmerk } from '@/lib/bezoek/types'

export const metadata = { title: 'Projectbezoek · EVA Mobiel' }

/**
 * Het uitvoerscherm van een projectbezoek.
 *
 * Staat op `/m/bezoek/[bezoekId]` en niet onder `/m/dossiers/[id]/…`: een statische map onder
 * `[id]` wint in de App Router van het dynamische `[tab]`-segment en maakt die tab onbereikbaar
 * — dezelfde reden als bij `/m/kwaliteit/[inspectieId]` en `/m/oplevering/[momentId]`.
 *
 * Deeplink-guard: wie het bezoek niet zelf uitvoert, moet een projectrol op het dossier hebben.
 * Een geraden id opent zo geen vreemd project.
 */
export default async function MobielBezoekPage({
  params,
}: {
  params: Promise<{ bezoekId: string }>
}) {
  const { bezoekId } = await params

  const [context, medewerker] = await Promise.all([
    getBezoek(bezoekId),
    getCurrentMedewerker(),
  ])
  if (!context || !medewerker) notFound()

  const eigenBezoek = context.bezoek.uitgevoerd_door === medewerker.id
  if (!eigenBezoek) {
    const rol = await heeftProjectrol(context.dossier.id, medewerker.id)
    if (!rol) notFound()
  }

  return (
    <>
      <AppHeader
        title={bezoekKenmerk(context.bezoek.volgnummer)}
        sub={context.dossier.titel}
        backHref={`/m/dossiers/${context.dossier.id}/informatie`}
      />
      <BezoekDoorloop context={context} />
    </>
  )
}
