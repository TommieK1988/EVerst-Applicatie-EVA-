import { Metadata } from 'next'
import LocatieDetail from '@/components/locaties/LocatieDetail'

export const metadata: Metadata = { title: 'Locatie' }

export default async function LocatiePage({
  params,
}: {
  params: Promise<{ id: string; projectdeelId: string; locatieId: string }>
}) {
  const { id, projectdeelId, locatieId } = await params
  return <LocatieDetail projectId={id} projectdeelId={projectdeelId} locatieId={locatieId} />
}
