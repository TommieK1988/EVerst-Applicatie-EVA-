import { Metadata } from 'next'
import ProjectdeelDetail from '@/components/projectdelen/ProjectdeelDetail'

export const metadata: Metadata = { title: 'Projectdeel' }

export default async function ProjectdeelPage({
  params,
}: {
  params: Promise<{ id: string; projectdeelId: string }>
}) {
  const { id, projectdeelId } = await params
  return <ProjectdeelDetail projectId={id} projectdeelId={projectdeelId} />
}
