import type { Metadata } from 'next'
import RapportagesOverzicht from '@/components/rapportages/RapportagesOverzicht'

export const metadata: Metadata = { title: 'Rapportages' }

export default function RapportagesPage() {
  return <RapportagesOverzicht />
}
