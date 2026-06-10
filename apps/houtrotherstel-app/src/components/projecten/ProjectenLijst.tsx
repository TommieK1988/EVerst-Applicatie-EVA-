'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, MapPin, Calendar } from 'lucide-react'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { formatDateShort } from '@/lib/utils'
import { getAllProjecten, getAllRegistraties } from '@/lib/local-store'

const STATUSSEN = [
  { value: '', label: 'Alle' },
  { value: 'onderhanden', label: 'Onderhanden' },
  { value: 'afgerond', label: 'Afgerond' },
]

export default function ProjectenLijst() {
  const [projecten, setProjecten] = useState<any[]>([])
  const [registraties, setRegistraties] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setProjecten(getAllProjecten())
    setRegistraties(getAllRegistraties())
  }, [])

  const gefilterd = projecten.filter(p => {
    if (status && p.status !== status) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        p.project_number.toLowerCase().includes(q) ||
        p.client_name?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <PageHeader
        title="Projecten"
        description={`${gefilterd.length} project${gefilterd.length !== 1 ? 'en' : ''} gevonden`}
        actions={
          <Link
            href="/projecten/nieuw"
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuw project</span>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoeken op naam, nummer of opdrachtgever..."
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
        />
        <div className="flex gap-2 flex-wrap">
          {STATUSSEN.map(s => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${status === s.value
                  ? 'bg-everts text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:border-slate-400'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {gefilterd.map(project => {
          const regs = registraties.filter(r => r.project_id === project.id)
          const openCount = regs.filter(r => r.status === 'open').length
          const gereedCount = regs.filter(r => r.status === 'gereed').length

          return (
            <Link
              key={project.id}
              href={`/projecten/${project.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-everts/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-400 font-mono">#{project.project_number}</span>
                    <StatusBadge status={project.status} type="project" size="sm" />
                  </div>
                  <h3 className="font-semibold text-slate-800 group-hover:text-everts transition-colors truncate">{project.name}</h3>
                  <p className="text-sm text-slate-500 truncate">{project.client_name}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{project.address}, {project.city}</span>
                </div>
                {project.start_date && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{formatDateShort(project.start_date)} → {formatDateShort(project.end_date)}</span>
                  </div>
                )}
              </div>
              {regs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs">
                  <span className="text-slate-500">{regs.length} registraties</span>
                  {openCount > 0 && <span className="text-everts">{openCount} open</span>}
                  {gereedCount > 0 && <span className="text-green-600">{gereedCount} gereed</span>}
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {gefilterd.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium">Geen projecten gevonden</p>
          <p className="text-sm mt-1">Pas je zoekopdracht aan of voeg een nieuw project toe.</p>
        </div>
      )}
    </div>
  )
}
