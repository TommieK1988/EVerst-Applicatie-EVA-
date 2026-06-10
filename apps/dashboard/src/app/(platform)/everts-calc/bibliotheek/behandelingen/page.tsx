import type { Metadata } from 'next'
import BehandelingenBeheer from '@/components/everts-calc/bibliotheek/BehandelingenBeheer'
import { getBehandelingen } from '@/lib/everts-calc/services/bibliotheek'

export const metadata: Metadata = { title: 'Behandelingen' }

export default async function BehandelingenPage() {
  const behandelingen = await getBehandelingen()
  return <BehandelingenBeheer behandelingen={behandelingen} />
}
