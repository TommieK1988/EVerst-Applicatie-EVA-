import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import PrikklokWeekClient from '@/components/mobiel/prikklok/PrikklokWeekClient'
import { vereisPrikklok } from '@/lib/prikklok/auth'
import { getPrikklokWeek } from '@/lib/prikklok/actions'

export const metadata = { title: 'Prikklok week · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/** De week zoals de prikklok hem invult, om aan het eind van de week te controleren. */
export default async function PrikklokWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await vereisPrikklok('/m')
  const { week } = await searchParams
  const data = await getPrikklokWeek(week)
  return (
    <>
      <AppHeader title="Prikklok" sub={`Week ${data.weekNr} · ${data.jaar}`} backHref="/m/prikklok" />
      <MobielPullToRefresh />
      <PrikklokWeekClient week={data} />
    </>
  )
}
