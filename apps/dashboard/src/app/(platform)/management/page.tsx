import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
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
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [projecten, akData, doelstellingen, laatstGesynchroniseerd, lopend, gereed, servicedesk] = await Promise.all([
    getManagementProjecten(),
    getManagementAk(),
    getManagementDoelstellingen(),
    getManagementLaatsteSync(),
    user_id ? laadLayouts(user_id, 'management-lopend') : [],
    user_id ? laadLayouts(user_id, 'management-gereed') : [],
    user_id ? laadLayouts(user_id, 'management-servicedesk') : [],
  ])

  return (
    <div style={{ padding: '24px 28px', height: '100%' }}>
      <ManagementDashboard
        projecten={projecten}
        akData={akData}
        doelstellingen={doelstellingen}
        laatstGesynchroniseerd={laatstGesynchroniseerd}
        user_id={user_id}
        layouts={{ lopend, gereed, servicedesk }}
      />
    </div>
  )
}
