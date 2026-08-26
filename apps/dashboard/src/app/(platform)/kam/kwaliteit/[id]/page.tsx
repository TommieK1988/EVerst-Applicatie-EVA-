import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { vereisSessie } from '@/lib/auth/rechten'
import { getInspectie } from '@/lib/kwaliteit/inspecties'
import { getDisciplines } from '@/lib/kwaliteit/bibliotheek'
import InspectieDetail from './InspectieDetail'

export const metadata: Metadata = { title: 'Kwaliteitsinspectie — KAM' }

export default async function KwaliteitInspectieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await vereisSessie()
  const { id } = await params

  const [context, disciplines] = await Promise.all([
    getInspectie(id),
    getDisciplines(),
  ])
  if (!context) notFound()

  return (
    <InspectieDetail
      context={context}
      disciplines={disciplines.map(d => ({ code: d.code, naam: d.naam }))}
    />
  )
}
