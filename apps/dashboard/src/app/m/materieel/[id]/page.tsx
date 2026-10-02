import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { getAppVertaler } from '@/i18n/server'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { signPad } from '@/lib/materieel/bestanden'
import { getMedewerkerOpties, getTeamOpties, volledigeNaam } from '@/lib/materieel/data'
import type { MaterieelObject } from '@/lib/materieel/types'
import AppHeader from '@/components/mobiel/AppHeader'
import PaspoortMobiel from '@/components/mobiel/materieel/PaspoortMobiel'

export const metadata = { title: 'Materieel' }
export const dynamic = 'force-dynamic'

/** Het paspoort op de telefoon — waar een scan op uitkomt. */
export default async function MobielPaspoortPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ scan?: string }>
}) {
  const medewerker = await vereisMaterieelToegang('lezen', '/m')
  const rechten = await getEffectieveRechten(medewerker)
  const magSchrijven = heeftModuleToegang(rechten, 'materieelbeheer', 'schrijven')
  // Uitgeven aan een ander is kantoorwerk; alleen 'beheren' krijgt die lijsten
  // mee, zodat we ze voor de buitendienst niet eens ophalen.
  const magBeheren = heeftModuleToegang(rechten, 'materieelbeheer', 'beheren')

  const { id } = await params
  const { scan } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any
  const { data } = await client.from('materieel_objecten').select('*').eq('id', id).maybeSingle()
  const object = data as MaterieelObject | null
  if (!object || !object.actief) notFound()

  const t = await getAppVertaler('materieel')
  // Toewijzing als naam: persoon, team, of algemeen gebruik.
  let toegewezenNaam = t('algemeenGebruik')
  if (object.toegewezen_medewerker_id) {
    const { data: mw } = await client
      .from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam')
      .eq('id', object.toegewezen_medewerker_id).maybeSingle()
    if (mw) toegewezenNaam = volledigeNaam(mw)
  } else if (object.toegewezen_team_id) {
    const { data: team } = await client
      .from('materieel_teams').select('naam').eq('id', object.toegewezen_team_id).maybeSingle()
    if (team) toegewezenNaam = (team as { naam: string }).naam
  }

  const [fotoUrl, medewerkers, teams] = await Promise.all([
    signPad(object.hoofdfoto_path),
    magBeheren ? getMedewerkerOpties() : Promise.resolve([]),
    magBeheren ? getTeamOpties() : Promise.resolve([]),
  ])

  return (
    <>
      <AppHeader title={t('titel')} sub={object.omschrijving} backHref="/m/materieel" />
      <PaspoortMobiel
        object={object}
        fotoUrl={fotoUrl}
        toegewezenNaam={toegewezenNaam}
        mijnId={medewerker.id}
        magSchrijven={magSchrijven}
        magBeheren={magBeheren}
        medewerkers={medewerkers}
        teams={teams}
        viaScan={scan === '1'}
      />
    </>
  )
}
