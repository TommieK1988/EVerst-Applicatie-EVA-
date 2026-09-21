import { notFound } from 'next/navigation'
import { vereisCommercieelToegang } from '@/lib/commercie/mobiel-auth'
import { getKlantbeeld } from '@/lib/commercie/klantbeeld'
import { leesToewijsbareMedewerkers } from '@/lib/commercie/toewijsbare-medewerkers'
import { getRelatieNotities } from '@/lib/relaties/notities-actions'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import KlantbeeldView from '@/components/mobiel/commercieel/KlantbeeldView'

export const metadata = { title: 'Klantbeeld · EVA Mobiel' }

/** Het klantbeeld verandert per gesprek; een gecachete versie is hier onbruikbaar. */
export const dynamic = 'force-dynamic'

export default async function KlantbeeldPage(props: { params: Promise<{ relatieId: string }> }) {
  const { relatieId } = await props.params
  const medewerker = await vereisCommercieelToegang('lezen', '/m')

  const [beeld, notities, rechten, medewerkers] = await Promise.all([
    getKlantbeeld(relatieId),
    getRelatieNotities(relatieId),
    getEffectieveRechten(medewerker),
    leesToewijsbareMedewerkers(),
  ])

  if (!beeld) notFound()

  // De twee schrijfrechten zijn verschillend omdat het verschillende entiteiten zijn: een
  // notitie hangt aan de relatie, een verkoopkans is een rij in het dossier-domein.
  const magSchrijven    = heeftModuleToegang(rechten, 'relaties', 'schrijven')
  const magVerkoopkans  = heeftModuleToegang(rechten, 'dossiers', 'schrijven')

  return (
    <>
      <AppHeader
        title={beeld.relatie.naam}
        sub={beeld.relatie.plaats ?? undefined}
        backHref="/m/commercieel"
      />
      <MobielPullToRefresh />
      <KlantbeeldView
        beeld={beeld}
        notities={notities}
        currentMedewerkerId={medewerker.id}
        magSchrijven={magSchrijven}
        magVerkoopkans={magVerkoopkans}
        medewerkers={medewerkers}
      />
    </>
  )
}
