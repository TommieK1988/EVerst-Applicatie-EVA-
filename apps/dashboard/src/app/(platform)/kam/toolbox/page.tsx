import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { laadLayouts } from '@/app/actions/layouts'
import { getToolboxen } from './actions'
import ToolboxOverzicht from '@/components/toolbox/ToolboxOverzicht'

export const metadata: Metadata = { title: 'Toolbox' }

export default async function ToolboxPage() {
  await vereisModuleToegang('toolbox', 'lezen')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd
  }

  const [data, layouts] = await Promise.all([
    getToolboxen(),
    user_id ? laadLayouts(user_id, 'toolbox-overzicht') : [],
  ])

  return <ToolboxOverzicht data={data} layouts={layouts} user_id={user_id} />
}
