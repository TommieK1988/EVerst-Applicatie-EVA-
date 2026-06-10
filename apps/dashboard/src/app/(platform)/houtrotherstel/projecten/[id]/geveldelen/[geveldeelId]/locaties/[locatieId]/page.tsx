import { Metadata } from 'next'
import LocatieDetail from '@/components/houtrotherstel/locaties/LocatieDetail'

export const metadata: Metadata = { title: 'Locatie' }

export default async function LocatiePage({
  params,
}: {
  params: Promise<{ id: string; geveldeelId: string; locatieId: string }>
}) {
  const { id, geveldeelId, locatieId } = await params
  return <LocatieDetail projectId={id} projectdeelId={geveldeelId} locatieId={locatieId} />
}
