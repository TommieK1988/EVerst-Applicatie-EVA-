'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import FunnelView from '@/components/management/FunnelView'

export default function ManagementVerkoopPage() {
  const { funnel } = useManagementData()
  return <FunnelView funnel={funnel} />
}
