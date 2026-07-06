import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getDossiersAfgeslotenAlle } from '@/lib/dossiers/actions'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { AfgeslotenLijst } from './AfgeslotenLijst'

export const metadata: Metadata = { title: 'Afgesloten' }

export default async function AfgeslotenPage() {
  await vereisModuleToegang('dossiers')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [result, layouts] = await Promise.all([
    getDossiersAfgeslotenAlle(),
    user_id ? laadLayouts(user_id, 'dossiers-afgesloten') : Promise.resolve([]),
  ])
  const dossiers = result.ok ? result.data : []

  return <AfgeslotenLijst dossiers={dossiers} layouts={layouts} user_id={user_id} />
}
