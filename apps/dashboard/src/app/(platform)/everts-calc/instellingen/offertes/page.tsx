import type { Metadata } from 'next'
import { getLayouts } from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import { getBetalingscondities } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import { getAlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import { getSjabloonteksten } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'
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
