import type { Metadata } from 'next'
import { getTeams, getInstellingen, getMedewerkerOpties } from '@/lib/materieel/data'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import InstellingenBeheer from '@/components/materieel/InstellingenBeheer'

export const metadata: Metadata = { title: 'Materieel-instellingen' }
export const dynamic = 'force-dynamic'

export default async function MaterieelInstellingenPage() {
  // Stamgegevens beheren is geen dagelijks gebruik → alleen beheerders.
  await vereisMaterieelToegang('beheren')

  const [teams, instellingen, medewerkerOpties] = await Promise.all([
    getTeams(), getInstellingen(), getMedewerkerOpties(),
  ])
  return <InstellingenBeheer teams={teams} instellingen={instellingen} medewerkerOpties={medewerkerOpties} />
}
