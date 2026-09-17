import type { Metadata } from 'next'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { getMedewerkerOpties } from '@/lib/materieel/data'
import FactuurImport from '@/components/materieel/FactuurImport'

export const metadata: Metadata = { title: 'Factuur inlezen' }
export const dynamic = 'force-dynamic'

export default async function FactuurImportPage() {
  // Inlezen maakt objecten aan; dat is schrijfwerk, geen kijkwerk.
  await vereisMaterieelToegang('schrijven')
  const medewerkerOpties = await getMedewerkerOpties()
  return <FactuurImport medewerkerOpties={medewerkerOpties} />
}
