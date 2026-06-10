'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, CheckCircle, Clock, Wrench, ExternalLink } from 'lucide-react'
import {
  getAllProjecten,
  getAllRegistraties,
  getReparatiesVoorProject,
} from '@/lib/houtrotherstel/local-store'
import type { Project, ProjectStatus } from '@/lib/houtrotherstel/types'

interface Rij {
  project: Project
  datumRapportage: string | null
  aantalReparaties: number
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === 'afgerond') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
      <CheckCircle className="w-3 h-3" /> Afgerond
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" /> Onderhanden
    </span>
  )
}

export default function RapportagesPage() {
  const [rijen, setRijen] = useState<Rij[]>([])

  useEffect(() => {
    const projecten = getAllProjecten()
    const registraties = getAllRegistraties()

    const rijden: Rij[] = projecten.map(project => {
      const projectRegs = registraties.filter(r => r.project_id === project.id)
      const recentste = projectRegs.length > 0
        ? projectRegs.sort((a, b) => b.datum.localeCompare(a.datum))[0].datum
        : null

      return {
        project,
        datumRapportage: recentste,
        aantalReparaties: getReparatiesVoorProject(project.id).length,
      }
    })

    const gesorteerd = rijden
      .sort((a, b) => {
        const da = a.datumRapportage ?? a.project.updated_at
        const db = b.datumRapportage ?? b.project.updated_at
        return db.localeCompare(da)
      })
      .slice(0, 25)

    setRijen(gesorteerd)
  }, [])

  return (
    <div className="space-y-5 pb-20 lg:pb-0">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rapportages</h1>
          <p className="text-sm text-slate-400 mt-0.5">Laatste 25 projecten</p>
        </div>
        <FileText className="w-6 h-6 text-slate-300" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rijen.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nog geen projecten</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Datum</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Project</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Opdrachtgever</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Status</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Reparaties</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">Rapportage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rijen.map(({ project, datumRapportage, aantalReparaties }) => {
                  const datum = datumRapportage
                    ? new Date(datumRapportage).toLocaleDateString('nl-NL', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : '—'

                  return (
                    <tr key={project.id} className="hover:bg-slate-50 transition-colors">

                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                        {datum}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{project.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">#{project.project_number}</div>
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                        {project.client_name || <span className="text-slate-300">—</span>}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <StatusBadge status={project.status} />
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {aantalReparaties > 0 ? (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Wrench className="w-3.5 h-3.5" />
                            {aantalReparaties}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/projecten/${project.id}/rapportage`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-everts hover:text-everts-dark transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Bekijken
                        </Link>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
