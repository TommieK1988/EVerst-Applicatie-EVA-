import type { Metadata } from 'next'
import { vereisRecht, heeftModuleToegang } from '@/lib/auth/rechten'
import { getBetaalrondes } from '@/lib/inkoopfacturen/actions'
import BetaalrondeOverzicht from './BetaalrondeOverzicht'

export const metadata: Metadata = { title: 'Betaalrondes' }

export default async function BetaalrondesPage() {
  const { rechten } = await vereisRecht('inkoopfacturen', 'lezen')
  const rondes = await getBetaalrondes()

  return (
    <BetaalrondeOverzicht
      rondes={rondes}
      magBeheren={heeftModuleToegang(rechten, 'inkoopfacturen', 'beheren')}
      allesZien={heeftModuleToegang(rechten, 'inkoopfacturen_alle', 'lezen')}
    />
  )
}
