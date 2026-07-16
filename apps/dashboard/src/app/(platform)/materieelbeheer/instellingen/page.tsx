import type { Metadata } from 'next'
import { getTeams, getInstellingen } from '@/lib/materieel/data'
import InstellingenBeheer from '@/components/materieel/InstellingenBeheer'

export const metadata: Metadata = { title: 'Materieel-instellingen' }
export const dynamic = 'force-dynamic'

export default async function MaterieelInstellingenPage() {
  const [teams, instellingen] = await Promise.all([getTeams(), getInstellingen()])
  return <InstellingenBeheer teams={teams} instellingen={instellingen} />
}
