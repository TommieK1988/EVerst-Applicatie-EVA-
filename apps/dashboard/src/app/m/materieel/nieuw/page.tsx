import { getAppVertaler } from '@/i18n/server'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { getMedewerkerOpties, getTeamOpties } from '@/lib/materieel/data'
import AppHeader from '@/components/mobiel/AppHeader'
import NieuwMaterieelForm from '@/components/mobiel/materieel/NieuwMaterieelForm'

export const metadata = { title: 'Materieel toevoegen' }
export const dynamic = 'force-dynamic'

/**
 * Materieel toevoegen op de telefoon. Vereist 'beheren' op materieelbeheer —
 * kijken mag met 'lezen', stickers koppelen met 'schrijven', toevoegen niet.
 */
export default async function NieuwMaterieelPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const medewerker = await vereisMaterieelToegang('beheren', '/m')
  const [{ code }, medewerkers, teams] = await Promise.all([
    searchParams, getMedewerkerOpties(), getTeamOpties(),
  ])

  const t = await getAppVertaler('materieel')
  const naam = [medewerker.voornaam, medewerker.achternaam].filter(Boolean).join(' ')

  return (
    <>
      <AppHeader
        title={t('nieuw.titel')}
        sub={code ? t('nieuw.subGescand') : t('nieuw.subZonder')}
        backHref="/m/materieel"
      />
      <NieuwMaterieelForm
        code={code ?? null}
        mijnId={medewerker.id}
        mijnNaam={naam}
        medewerkers={medewerkers}
        teams={teams}
      />
    </>
  )
}
