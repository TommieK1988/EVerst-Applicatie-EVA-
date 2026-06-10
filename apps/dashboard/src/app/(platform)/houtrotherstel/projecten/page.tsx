import { Metadata } from 'next'
import ProjectenLijst from '@/components/houtrotherstel/projecten/ProjectenLijst'

export const metadata: Metadata = { title: 'Projecten' }

export default function ProjectenPage() {
  return <ProjectenLijst />
}
