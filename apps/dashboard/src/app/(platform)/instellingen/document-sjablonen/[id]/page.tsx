import { notFound } from 'next/navigation'
import { getSjabloon } from '../actions'
import SjabloonEditorClient from './SjabloonEditorClient'
import { vereisModuleToegang } from '@/lib/auth/rechten'

export const metadata = { title: 'Documentsjabloon' }
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await vereisModuleToegang('instellingen', 'beheren')

  const { id } = await params
  const sjabloon = await getSjabloon(id)
  if (!sjabloon) notFound()

  return <SjabloonEditorClient sjabloon={sjabloon} />
}
