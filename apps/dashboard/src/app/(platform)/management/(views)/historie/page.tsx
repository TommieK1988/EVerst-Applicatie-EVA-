import HistorieView from '@/components/management/HistorieView'
import type { SnapshotDetailDeel } from '@/components/management/SnapshotDetail'
import { maandParam } from '@/components/management/maand'
import {
  getSnapshotPeriodes, getSnapshotRegels, alsWerkCijfers,
} from '@/lib/dashboard/snapshot-queries'

const DELEN: SnapshotDetailDeel[] = ['dashboard', 'werken', 'wijzigingen']

/**
 * Historie van vastgestelde maandcijfers. `?periode=YYYY-MM` opent één maand; `?deel=` kiest
 * het tabblad. De werkenregels laadt de server alleen voor het tabblad dat ze nodig heeft.
 */
export default async function ManagementHistoriePage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; deel?: string }>
}) {
  const { periode, deel: deelParam } = await searchParams
  const deel: SnapshotDetailDeel = DELEN.find(d => d === deelParam) ?? 'dashboard'

  if (!periode) return <HistorieView detail={null} />

  const periodes = await getSnapshotPeriodes()
  const i = periodes.findIndex(p => maandParam(p.periode) === periode)
  if (i < 0) return <HistorieView detail={null} />
  const huidig = periodes[i]
  const vorige = periodes[i + 1] ?? null // nieuwste eerst → de oudere staat erna

  const [regels, vorigeRegels] = await Promise.all([
    deel === 'dashboard' ? Promise.resolve(null) : getSnapshotRegels(huidig.id),
    deel === 'wijzigingen' && vorige ? getSnapshotRegels(vorige.id) : Promise.resolve(null),
  ])

  return (
    <HistorieView
      detail={{
        periode: huidig.periode,
        deel,
        regels,
        vorigePeriode: vorige?.periode ?? null,
        vorigeRegels: vorigeRegels ? vorigeRegels.map(alsWerkCijfers) : null,
      }}
    />
  )
}
