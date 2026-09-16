'use client'

import { useManagementData } from '@/components/management/ManagementShell'
import FunnelView from '@/components/management/FunnelView'
import CommercieBlok from '@/components/management/CommercieBlok'

export default function ManagementVerkoopPage() {
  const { funnel, commercie } = useManagementData()
  return (
    <>
      <FunnelView funnel={funnel} />
      <CommercieBlok cijfers={commercie} />
    </>
  )
}
