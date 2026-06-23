import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getMijnTakenRijen } from '@/lib/taken/services/taken'
import TakenActieveDossiers from '@/components/taken/TakenActieveDossiers'

export const metadata: Metadata = { title: 'Mijn taken' }

export default async function MijnTakenPage() {
  await vereisModuleToegang('mijn_taken')

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
    user_id ? getMijnTakenRijen(user_id) : Promise.resolve([]),
    user_id ? laadLayouts(user_id, 'mijn-taken') : [],
  ])

  return (
    <TakenActieveDossiers
      data={data}
      layouts={layouts}
      user_id={user_id}
      titel="Mijn taken"
      subtitel="Al jouw toegewezen open taken."
      scherm="mijn-taken"
      verbergToegewezenSlicer
      beginSortering={[{ id: 'deadline', desc: false }]}
    />
  )
}
