import { Metadata } from 'next'
import GeveldeelDetail from '@/components/houtrotherstel/geveldelen/GeveldeelDetail'

export const metadata: Metadata = { title: 'Geveldeel' }

export default async function GeveldeelPage({
  params,
}: {
  params: Promise<{ id: string; geveldeelId: string }>
}) {
  const { id, geveldeelId } = await params
  return <GeveldeelDetail projectId={id} geveldeelId={geveldeelId} />
}
