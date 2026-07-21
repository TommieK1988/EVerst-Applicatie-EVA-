import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getToolbox, getRapportage, getToewijsbareMedewerkers } from '../actions'
import ToolboxRapportage from '@/components/toolbox/ToolboxRapportage'

export const metadata: Metadata = { title: 'Toolbox — Rapportage' }

export default async function ToolboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await vereisModuleToegang('toolbox', 'lezen')
  const { id } = await params

  const res = await getToolbox(id)
  if (!res.ok) notFound()

  const [deelnemers, medewerkers] = await Promise.all([
    getRapportage(id),
    getToewijsbareMedewerkers(),
  ])

  return (
    <ToolboxRapportage
      toolbox={{ id: res.data.id, titel: res.data.titel, status: res.data.status, huidige_versie: res.data.huidige_versie }}
      deelnemers={deelnemers}
      medewerkers={medewerkers}
    />
  )
}
