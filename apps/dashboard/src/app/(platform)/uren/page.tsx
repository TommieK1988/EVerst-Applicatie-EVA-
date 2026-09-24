import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisSessie, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { SkeletonCard } from '@/components/ui'
import { getAlleUren } from '@/lib/uren/actions'
import { getOnkosten } from '@/lib/uren/onkosten-overzicht'
import { haalDagVergelijking, type MedewerkerDag } from '@/lib/uren/aanwezigheid-bij-uren'
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

  // De onkosten alleen voor wie ze uitbetaalt. Een projectleider zonder financieel-recht ziet
  // de kosten van zijn eigen mensen op /m/uren/keuren; het bedrijfsbrede overzicht is niet aan hem.
  const [alle, layouts, onkosten] = await Promise.all([
    getAlleUren(periode),
    user_id ? laadLayouts(user_id, 'uren') : Promise.resolve([]),
    magAlles ? getOnkosten(periode) : Promise.resolve(null),
  ])

  // Zonder financieel-recht gaat alleen je eigen goed te keuren werk naar de browser. Dit hoort
  // hier en niet in het scherm: een filter aan de clientkant is geen afscherming.
  const data = magAlles ? alle : (() => {
    const eigen = alle.regels.filter(r =>
      r.vasteGoedkeurderId != null
        ? r.vasteGoedkeurderId === medewerkerId
        : (r.teamleiderId === medewerkerId || r.projectleiderId === medewerkerId),
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

  // Aanwezig tegenover geboekt, per medewerker-dag. Pas NA de afscherming hierboven: wie alleen
  // zijn eigen te keuren uren ziet, krijgt ook alleen van díe dagen de werktijden mee.
  // Voor een kwartaal of een heel jaar alleen de dagen met nog open uren -- daar dient het voor,
  // en een jaar aan ritten van het hele wagenpark doorrekenen per paginabezoek is te zwaar.
  const alleDagen = periode === 'deze_maand' || periode === 'vorige_maand'
  const vergelijking = await haalDagVergelijking(
    data.regels
      .filter(r => r.bouw7MedewerkerId != null && r.datum != null && (alleDagen || !r.geaccordeerd))
      .map((r): MedewerkerDag => ({ bouw7MedewerkerId: r.bouw7MedewerkerId!, datum: r.datum! })),
  )

  return (
    <UrenOverzicht
      data={data} onkosten={onkosten} periode={periode} layouts={layouts} user_id={user_id}
      magAlles={magAlles} medewerkerId={medewerkerId} vergelijking={vergelijking}
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
