import type { Metadata } from 'next'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { getMedewerkerOpties } from '@/lib/materieel/data'
import MaterieelForm from '@/components/materieel/MaterieelForm'

export const metadata: Metadata = { title: 'Nieuw materieel' }
export const dynamic = 'force-dynamic'

export default async function NieuwMaterieelPage() {
  // Materieel toevoegen is voorbehouden aan 'beheren'.
  await vereisMaterieelToegang('beheren')
  const medewerkerOpties = await getMedewerkerOpties()
  return <MaterieelForm medewerkerOpties={medewerkerOpties} />
}
