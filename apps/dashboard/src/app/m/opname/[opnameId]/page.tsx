import { notFound } from 'next/navigation'
import AppHeader from '@/components/mobiel/AppHeader'
import OpnameScherm from '@/components/mobiel/opname/OpnameScherm'
import { getOpnameMetRegels } from '@/lib/opname/opnames'
import { getBibliotheek, getVaakGebruikt } from '@/lib/opname/bibliotheek'
import { getCurrentMedewerker } from '@/lib/auth/rechten'

export const metadata = { title: 'Opname · EVA Mobiel' }

/**
 * Het uitvoerscherm van de opname.
 *
 * Staat bewust op `/m/opname/[opnameId]` en niet onder `/m/dossiers/[id]/...`: een statische map
 * onder `[id]` wint in de App Router van het dynamische `[tab]`-segment en maakt die tab
 * onbereikbaar — dezelfde reden als bij `/m/kwaliteit/[inspectieId]` en `/m/oplevering/[momentId]`.
 *
 * De deeplink-guard zit in `getOpnameMetRegels` → `magOpnameOpenen`: wie de opname niet zelf
 * uitvoert, moet een projectrol op het dossier hebben. Zonder dat opent een geraden uuid een
 * vreemde opname mét de prijsafspraken van een andere opdrachtgever.
 */
export default async function MobielOpnamePage({
  params,
}: {
  params: Promise<{ opnameId: string }>
}) {
  const { opnameId } = await params

  // Eerst zelf op een medewerker-record controleren. `getOpnameMetRegels` gooit anders een
  // GeenToegangError die als serverfout in het log belandt; voor een bezoeker zonder EVA-account
  // (bijvoorbeeld iemand met een klantportaal-sessie) is dat gewoon "niet gevonden".
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) notFound()

  const opname = await getOpnameMetRegels(opnameId)
  if (!opname) notFound()

  const bibliotheek = await getBibliotheek(opname.prijslijst_id)
  if (!bibliotheek) notFound()

  // Suggestielijstje; mag falen zonder het scherm te blokkeren.
  const vaakGebruikt = await getVaakGebruikt(opname.prijslijst_id).catch(() => [])

  return (
    <>
      <AppHeader
        title="Opname"
        sub={`${opname.opnamenummer}${opname.adres_vrij ? ` · ${opname.adres_vrij}` : ''}`}
        backHref={`/m/dossiers/${opname.dossier_id}/opname`}
      />
      <OpnameScherm
        opname={opname}
        onderdelen={bibliotheek.onderdelen}
        ruimtes={bibliotheek.ruimtes}
        vaakGebruiktIds={vaakGebruikt}
      />
    </>
  )
}
