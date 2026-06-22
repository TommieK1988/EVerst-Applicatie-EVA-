import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import ManagementShell from '@/components/management/ManagementShell'
import {
  getManagementProjecten,
  getManagementAk,
  getManagementDoelstellingen,
  getManagementLaatsteSync,
  getFunnelData,
  getCalculatorStats,
  getMaandSnapshots,
} from '@/lib/dashboard/queries'
import { vereisModuleToegang } from '@/lib/auth/rechten'

// Live data uit management_projecten — niet statisch cachen.
export const dynamic = 'force-dynamic'

export default async function ManagementViewsLayout({ children }: { children: React.ReactNode }) {
  await vereisModuleToegang('management')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [
    projecten, akData, doelstellingen, laatstGesynchroniseerd,
    funnel, calculators, snapshots,
    lopend, gereed, servicedesk,
  ] = await Promise.all([
    getManagementProjecten(),
    getManagementAk(),
    getManagementDoelstellingen(),
    getManagementLaatsteSync(),
    getFunnelData(),
    getCalculatorStats(),
    getMaandSnapshots(),
    user_id ? laadLayouts(user_id, 'management-lopend') : [],
    user_id ? laadLayouts(user_id, 'management-gereed') : [],
    user_id ? laadLayouts(user_id, 'management-servicedesk') : [],
  ])

  return (
    <div style={{ padding: '24px 28px', height: '100%' }}>
      <ManagementShell
        projecten={projecten}
        akData={akData}
        doelstellingen={doelstellingen}
        funnel={funnel}
        calculators={calculators}
        snapshots={snapshots}
        laatstGesynchroniseerd={laatstGesynchroniseerd}
        user_id={user_id}
        layouts={{ lopend, gereed, servicedesk }}
      >
        {children}
      </ManagementShell>
    </div>
  )
}
