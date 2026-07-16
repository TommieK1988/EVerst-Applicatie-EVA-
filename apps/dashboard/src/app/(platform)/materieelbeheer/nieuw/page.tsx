import type { Metadata } from 'next'
import { getMedewerkerOpties } from '@/lib/materieel/data'
import MaterieelForm from '@/components/materieel/MaterieelForm'

export const metadata: Metadata = { title: 'Nieuw materieel' }
export const dynamic = 'force-dynamic'

export default async function NieuwMaterieelPage() {
  const medewerkerOpties = await getMedewerkerOpties()
  return <MaterieelForm medewerkerOpties={medewerkerOpties} />
}
