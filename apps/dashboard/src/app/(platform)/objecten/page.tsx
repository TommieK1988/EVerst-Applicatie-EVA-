import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisRecht } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'
import { getObjecten } from '@/lib/objecten/data'
import ObjectenOverzicht from './ObjectenOverzicht'

export const metadata: Metadata = { title: 'Objecten' }

export default async function ObjectenPage() {
  // De module is in productie afwezig tot de vlag aangaat; 404 in plaats van een leeg scherm.
  if (!FEATURES.objectenbeheer) notFound()
  const { rechten } = await vereisRecht('objectenbeheer', 'lezen')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [objecten, layouts] = await Promise.all([
    getObjecten(),
    user_id ? laadLayouts(user_id, 'objecten') : [],
  ])

  return (
    <ObjectenOverzicht
      objecten={objecten}
      layouts={layouts}
      user_id={user_id}
      magSchrijven={rechten.objectenbeheer === 'schrijven' || rechten.objectenbeheer === 'beheren'}
      magBeheren={rechten.objectenbeheer === 'beheren'}
    />
  )
}
