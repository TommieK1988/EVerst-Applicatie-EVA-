import type { Metadata } from 'next'
import ManagementDashboard from '@/components/management/ManagementDashboard'
import {
  getManagementProjecten,
  getManagementAk,
  getManagementDoelstellingen,
  getManagementLaatsteSync,
} from '@/lib/dashboard/queries'

export const metadata: Metadata = { title: 'Management' }

// Live data uit management_projecten — niet statisch cachen.
export const dynamic = 'force-dynamic'

export default async function ManagementPage() {
  const [projecten, akData, doelstellingen, laatstGesynchroniseerd] = await Promise.all([
    getManagementProjecten(),
    getManagementAk(),
    getManagementDoelstellingen(),
    getManagementLaatsteSync(),
  ])

  return (
    <div style={{ padding: '24px 28px', height: '100%' }}>
      <ManagementDashboard
        projecten={projecten}
        akData={akData}
        doelstellingen={doelstellingen}
        laatstGesynchroniseerd={laatstGesynchroniseerd}
      />
    </div>
  )
}
