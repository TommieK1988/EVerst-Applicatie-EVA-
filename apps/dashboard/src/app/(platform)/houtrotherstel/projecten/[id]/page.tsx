import { Metadata } from 'next'
import ProjectDetail from '@/components/houtrotherstel/projecten/ProjectDetail'

export const metadata: Metadata = { title: 'Project detail' }

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProjectDetail projectId={id} />
}
