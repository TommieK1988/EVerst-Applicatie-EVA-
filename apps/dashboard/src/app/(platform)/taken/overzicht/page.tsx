import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getTakenVoorActieveDossiers } from '@/lib/taken/services/taken'
import TakenActieveDossiers from '@/components/taken/TakenActieveDossiers'

export const metadata: Metadata = { title: 'Taken — Overzicht' }

export default async function TakenOverzichtPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [data, layouts] = await Promise.all([
    getTakenVoorActieveDossiers(),
    user_id ? laadLayouts(user_id, 'taken-overzicht') : [],
  ])

  return <TakenActieveDossiers data={data} layouts={layouts} user_id={user_id} />
}
