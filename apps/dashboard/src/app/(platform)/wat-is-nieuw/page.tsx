import type { Metadata } from 'next'
import { getChangelog } from './actions'
import WatIsNieuwTijdlijn from '@/components/eva/WatIsNieuwTijdlijn'

export const metadata: Metadata = { title: 'Wat is nieuw' }

// Geen rechten-gate: het changelog-overzicht is voor iedereen zichtbaar.
export default async function WatIsNieuwPage() {
  const items = await getChangelog()
  return <WatIsNieuwTijdlijn items={items} />
}
