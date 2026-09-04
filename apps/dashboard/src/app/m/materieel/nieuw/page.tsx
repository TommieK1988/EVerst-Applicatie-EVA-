import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import AppHeader from '@/components/mobiel/AppHeader'
import NieuwMaterieelForm from '@/components/mobiel/materieel/NieuwMaterieelForm'

export const metadata = { title: 'Materieel toevoegen' }
export const dynamic = 'force-dynamic'

/**
 * Materieel toevoegen op de telefoon. Vereist 'schrijven' op materieelbeheer —
 * kijken mag met 'lezen', toevoegen niet.
 */
export default async function NieuwMaterieelPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const medewerker = await vereisMaterieelToegang('schrijven', '/m')
  const { code } = await searchParams

  const naam = [medewerker.voornaam, medewerker.achternaam].filter(Boolean).join(' ')

  return (
    <>
      <AppHeader
        title="Nieuw materieel"
        sub={code ? 'Sticker gescand' : 'Zonder sticker'}
        backHref="/m/materieel"
      />
      <NieuwMaterieelForm code={code ?? null} mijnId={medewerker.id} mijnNaam={naam} />
    </>
  )
}
