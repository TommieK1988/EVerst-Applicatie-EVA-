import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProjectForm from '@/components/houtrotherstel/projecten/ProjectForm'
export const metadata: Metadata = { title: 'Nieuw project' }

export default function NieuwProjectPage() {
  return (
    <div className="max-w-3xl space-y-6 pb-20 lg:pb-0">
      <div>
        <Link
          href="/houtrotherstel/projecten"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar projecten
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Nieuw project</h1>
      </div>

      <ProjectForm userId="" />
    </div>
  )
}
