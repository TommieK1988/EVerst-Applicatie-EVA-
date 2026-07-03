import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getCalculatiesMetData } from '@/lib/everts-calc/services/calculaties'
import { CalculatieOverzicht } from './CalculatieOverzicht'

export const metadata: Metadata = { title: 'Calculaties' }

export default async function CalculatiesPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [calculaties, layouts] = await Promise.all([
    getCalculatiesMetData(),
    user_id ? laadLayouts(user_id, 'everts-calc-calculaties') : Promise.resolve([]),
  ])

  return (
    <CalculatieOverzicht
      calculaties={calculaties}
      layouts={layouts}
      user_id={user_id}
    />
  )
}
