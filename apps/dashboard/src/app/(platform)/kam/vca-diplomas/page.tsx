import type { Metadata } from 'next'
import { vereisSessie } from '@/lib/auth/rechten'
import { getVcaOverzicht } from './actions'
import VcaDiplomasOverzicht from '@/components/kam/VcaDiplomasOverzicht'

export const metadata: Metadata = { title: 'KAM / VGM — VCA-diploma’s' }

export default async function VcaDiplomasPage() {
  await vereisSessie()
  const rijen = await getVcaOverzicht()
  return <VcaDiplomasOverzicht rijen={rijen} />
}
