'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import HistorieView from '@/components/management/HistorieView'

export default function ManagementHistoriePage() {
  const { snapshots } = useManagementData()
  return <HistorieView snapshots={snapshots} />
}
