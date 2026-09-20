import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { vereisCommercieelToegang } from '@/lib/commercie/mobiel-auth'
import { getKlantbeeld } from '@/lib/commercie/klantbeeld'
import { getRelatieNotities } from '@/lib/relaties/notities-actions'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import KlantbeeldView from '@/components/mobiel/commercieel/KlantbeeldView'

export const metadata = { title: 'Klantbeeld · EVA Mobiel' }

/** Het klantbeeld verandert per gesprek; een gecachete versie is hier onbruikbaar. */
export const dynamic = 'force-dynamic'

/**
 * Wie een verkoopkans of actie toegewezen kan krijgen.
 *
 * Begrensd op actieve medewerkers: enkele tientallen, ruim onder de 1000 rijen waarop
 * PostgREST stil afkapt, en precies de groep die iets kan oppakken. Wie geen `auth_user_id`
 * heeft kan geen actie toegewezen krijgen (die landt via `task_assignees` op de auth-user);
 * dat filtert `VastleggenSheet` af, zodat zo iemand wél een verkoopkans kan krijgen.
 */
async function leesToewijsbareMedewerkers() {
  const { data } = await createAdminClient()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, auth_user_id')
    .eq('actief', true)
    .order('voornaam')

  return (data ?? []).map(m => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Naamloos',
    authUserId: m.auth_user_id,
  }))
}

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
