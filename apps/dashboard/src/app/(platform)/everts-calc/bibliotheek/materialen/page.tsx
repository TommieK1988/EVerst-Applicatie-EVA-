import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import MaterialenBibliotheek from '@/components/everts-calc/bibliotheek/MaterialenBibliotheek'

export const metadata: Metadata = { title: 'Materialen' }

export default async function MaterialenPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const layouts = user_id ? await laadLayouts(user_id, 'everts-calc-materialen') : []

  return <MaterialenBibliotheek layouts={layouts} user_id={user_id} />
}
