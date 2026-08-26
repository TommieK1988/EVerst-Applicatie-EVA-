import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisSessie } from '@/lib/auth/rechten'
import { getInspecties } from '@/lib/kwaliteit/inspecties'
import { getDisciplines } from '@/lib/kwaliteit/bibliotheek'
import InspectiesOverzicht from './InspectiesOverzicht'

export const metadata: Metadata = { title: 'Kwaliteitsinspecties — KAM' }

export default async function KwaliteitInspectiesPage() {
  await vereisSessie()

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [inspecties, disciplines, layouts] = await Promise.all([
    getInspecties(),
    getDisciplines(),
    user_id ? laadLayouts(user_id, 'kwaliteit-inspecties') : [],
  ])

  return (
    <InspectiesOverzicht
      inspecties={inspecties}
      disciplines={disciplines.map(d => ({ code: d.code, naam: d.naam }))}
      layouts={layouts}
      user_id={user_id}
    />
  )
}
