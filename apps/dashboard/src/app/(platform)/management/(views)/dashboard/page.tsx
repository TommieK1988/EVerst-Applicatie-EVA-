import DashboardPagina from '@/components/management/DashboardPagina'
import { getSnapshotPeriodes, getSnapshotRegels, alsWerkCijfers } from '@/lib/dashboard/snapshot-queries'
import { maandParam } from '@/components/management/maand'

/**
 * Live dashboard. De vergelijking voor "grote wijzigingen" loopt standaard tegen de laatst
 * vastgestelde maand; `?vergelijk=YYYY-MM` kiest een eerdere.
 */
export default async function ManagementDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vergelijk?: string }>
}) {
  const { vergelijk } = await searchParams
  const periodes = await getSnapshotPeriodes()
  const gekozen = periodes.find(p => maandParam(p.periode) === vergelijk) ?? periodes[0] ?? null
  const regels = gekozen ? (await getSnapshotRegels(gekozen.id)).map(alsWerkCijfers) : null

  return (
    <DashboardPagina
      periodes={periodes.map(p => p.periode)}
      gekozen={gekozen?.periode ?? null}
      vorigeRegels={regels}
    />
  )
}
