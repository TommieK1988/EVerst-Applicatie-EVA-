import type { Metadata } from 'next'
import { getLayouts } from '@/app/actions/quote-instellingen'
import { getBetalingscondities } from '@/app/actions/betalingscondities'
import { getAlgemeneVoorwaarden } from '@/app/actions/algemene-voorwaarden'
import { getSjabloonteksten } from '@/app/actions/sjabloonteksten'
import OffertesInstellingen from './OffertesInstellingen'

export const metadata: Metadata = { title: 'Offerte instellingen' }

export default async function OffertesInstellingenPage() {
  const [layouts, betalingscondities, algVoorwaarden, sjabloonteksten] = await Promise.all([
    getLayouts(),
    getBetalingscondities(),
    getAlgemeneVoorwaarden(),
    getSjabloonteksten(),
  ])

  return (
    <OffertesInstellingen
      layouts={layouts}
      betalingscondities={betalingscondities}
      algVoorwaarden={algVoorwaarden}
      sjabloonteksten={sjabloonteksten}
    />
  )
}
