import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { SkeletonCard } from '@/components/ui'
import { getAlleUren } from '@/lib/uren/actions'
import { alsPeriode, type UrenPeriode } from '@/lib/uren/types'
import UrenOverzicht from './UrenOverzicht'

export const metadata: Metadata = { title: 'Uren — geboekte uren' }

/** Live uit Bouw7 bij elke weergave — nooit een gecachete urenstand tonen. */
export const dynamic = 'force-dynamic'

async function UrenInhoud({ periode }: { periode: UrenPeriode }) {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch { /* geen sessie → geen opgeslagen kolomlayouts, tabel werkt verder gewoon */ }

  const [data, layouts] = await Promise.all([
    getAlleUren(periode),
    user_id ? laadLayouts(user_id, 'uren') : Promise.resolve([]),
  ])

  return <UrenOverzicht data={data} periode={periode} layouts={layouts} user_id={user_id} />
}

export default async function UrenPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  await vereisModuleToegang('financieel')
  const periode = alsPeriode((await searchParams).periode)

  return (
    // key op de periode: bij het wisselen valt de Suspense terug op het skelet i.p.v.
    // de oude periode te blijven tonen tijdens het ophalen.
    <Suspense key={periode} fallback={<SkeletonCard />}>
      <UrenInhoud periode={periode} />
    </Suspense>
  )
}
