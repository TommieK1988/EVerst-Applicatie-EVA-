'use client'

import { useMemo } from 'react'
import { useManagementData } from '@/components/management/ManagementShell'
import { berekenManagementKpi } from '@/lib/dashboard/aggregaties'
import DashboardView from '@/components/management/DashboardView'

export default function ManagementDashboardPage() {
  const { projecten, akData, doelstellingen } = useManagementData()
  const kpi = useMemo(
    () => berekenManagementKpi(projecten, akData, doelstellingen),
    [projecten, akData, doelstellingen],
  )
  return <DashboardView kpi={kpi} />
}
