import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisSessie, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { SkeletonCard } from '@/components/ui'
import { getAlleUren } from '@/lib/uren/actions'
import { alsPeriode, type UrenPeriode } from '@/lib/uren/types'
import UrenOverzicht from './UrenOverzicht'

export const metadata: Metadata = { title: 'Uren — geboekte uren' }

/** Live uit Bouw7 bij elke weergave — nooit een gecachete urenstand tonen. */
export const dynamic = 'force-dynamic'

async function UrenInhoud({ periode, magAlles, medewerkerId }: {
  periode: UrenPeriode
  magAlles: boolean
  medewerkerId: string
}) {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch { /* geen sessie → geen opgeslagen kolomlayouts, tabel werkt verder gewoon */ }

  const [alle, layouts] = await Promise.all([
    getAlleUren(periode),
    user_id ? laadLayouts(user_id, 'uren') : Promise.resolve([]),
  ])

  // Zonder financieel-recht gaat alleen je eigen goed te keuren werk naar de browser. Dit hoort
  // hier en niet in het scherm: een filter aan de clientkant is geen afscherming.
  const data = magAlles ? alle : (() => {
    const eigen = alle.regels.filter(
      r => r.teamleiderId === medewerkerId || r.projectleiderId === medewerkerId,
    )
    return {
      ...alle,
      regels: eigen,
      totalen: {
        uren: eigen.reduce((s, r) => s + r.uren, 0),
        bedrag: eigen.reduce((s, r) => s + r.bedrag, 0),
      },
    }
  })()

  return (
    <UrenOverzicht
      data={data} periode={periode} layouts={layouts} user_id={user_id}
      magAlles={magAlles} medewerkerId={medewerkerId}
    />
  )
}

export default async function UrenPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  // Het urenoverzicht was afgeschermd op het financieel-recht. Sinds hier ook geaccordeerd wordt
  // moeten projectleiders en teamleiders erbij kunnen, en die hebben dat recht doorgaans niet.
  // In plaats van het recht te verruimen hangt de INHOUD er nu vanaf: zonder financieel zie je
  // alleen de uren die je zelf moet goedkeuren, niet de urenstand van het hele bedrijf.
  const medewerker = await vereisSessie()
  const magAlles = heeftModuleToegang(await getEffectieveRechten(), 'financieel', 'lezen')
  const periode = alsPeriode((await searchParams).periode)

  return (
    // key op de periode: bij het wisselen valt de Suspense terug op het skelet i.p.v.
    // de oude periode te blijven tonen tijdens het ophalen.
    <Suspense key={periode} fallback={<SkeletonCard />}>
      <UrenInhoud periode={periode} magAlles={magAlles} medewerkerId={medewerker.id} />
    </Suspense>
  )
}
