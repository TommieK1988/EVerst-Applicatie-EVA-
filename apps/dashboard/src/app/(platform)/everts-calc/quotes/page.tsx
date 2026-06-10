import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { getQuotesMetMarge } from '@/lib/everts-calc/services/quotes'
import { OfferteOverzicht } from './OfferteOverzicht'

export const metadata: Metadata = { title: 'Offertes' }

export default async function QuotesPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [offertes, layouts] = await Promise.all([
    getQuotesMetMarge(),
    user_id ? laadLayouts(user_id, 'everts-calc-quotes') : Promise.resolve([]),
  ])

  return (
    <OfferteOverzicht
      offertes={offertes}
      layouts={layouts}
      user_id={user_id}
    />
  )
}
