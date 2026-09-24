import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import PrikklokClient from '@/components/mobiel/prikklok/PrikklokClient'
import { vereisPrikklok } from '@/lib/prikklok/auth'
import { getPrikklokStatus } from '@/lib/prikklok/actions'

export const metadata = { title: 'Prikklok · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/**
 * Digitale prikklok: in- en uitklokken op het werkadres. Zolang de fase 'schaduw' is, ziet
 * alleen een tester dit scherm en telt niets mee voor de echte urenstaat.
 */
export default async function PrikklokPage() {
  const { instellingen } = await vereisPrikklok('/m')
  const status = await getPrikklokStatus()
  return (
    <>
      <AppHeader
        title="Prikklok"
        sub={instellingen.fase === 'schaduw' ? 'Testmodus' : undefined}
        backHref="/m"
      />
      <MobielPullToRefresh />
      <PrikklokClient status={status} />
    </>
  )
}
