'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ProjectForm from '@/components/projecten/ProjectForm'
import { getAllProjecten } from '@/lib/local-store'
import type { Project } from '@/lib/types'

export default function ProjectBewerkenPage() {
  const params = useParams()
  const id = params.id as string
  const [project, setProject] = useState<Project | null | undefined>(undefined)

  useEffect(() => {
    const p = getAllProjecten().find(x => x.id === id)
    setProject(p ?? null)
  }, [id])

  if (project === undefined) return (
    <div className="flex items-center justify-center h-40 text-slate-400">Laden...</div>
  )

  if (project === null) return (
    <div className="flex items-center justify-center h-40 text-slate-400">Project niet gevonden</div>
  )

  return (
    <div className="max-w-3xl space-y-6 pb-20 lg:pb-0">
      <div>
        <Link
          href={`/projecten/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {project.name}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Project bewerken</h1>
      </div>

      <ProjectForm project={project} />
    </div>
  )
}
