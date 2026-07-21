import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getGepubliceerdSchema } from '../../actions'
import ToolboxPresentatie from '@/components/toolbox/ToolboxPresentatie'

export const metadata: Metadata = { title: 'Toolbox — Presenteren' }

export default async function ToolboxPresenterenPage({ params }: { params: Promise<{ id: string }> }) {
  await vereisModuleToegang('toolbox', 'lezen')
  const { id } = await params

  const data = await getGepubliceerdSchema(id)
  if (!data) notFound()

  return <ToolboxPresentatie titel={data.titel} schema={data.schema} />
}
