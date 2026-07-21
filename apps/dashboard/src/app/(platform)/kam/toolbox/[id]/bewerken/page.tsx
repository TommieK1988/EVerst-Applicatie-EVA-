import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getToolbox } from '../../actions'
import ToolboxBuilder from '@/components/toolbox/builder/ToolboxBuilder'

export const metadata: Metadata = { title: 'Toolbox — Bewerken' }

export default async function ToolboxBewerkenPage({ params }: { params: Promise<{ id: string }> }) {
  await vereisModuleToegang('toolbox', 'schrijven')
  const { id } = await params

  const res = await getToolbox(id)
  if (!res.ok) notFound()

  return <ToolboxBuilder toolbox={res.data} />
}
