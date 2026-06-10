'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, ChevronRight, MapPin, Trash2, Wrench,
} from 'lucide-react'
import {
  getAllProjecten, getAllProjectdelen, getLocatiesVoorProjectdeel,
  saveLocatie, deleteLocatie, getReparatiesVoorLocatie,
} from '@/lib/local-store'
import type { Project, Projectdeel, Locatie } from '@/lib/types'

interface Props {
  projectId: string
  geveldeelId: string
}

export default function GeveldeelDetail({ projectId, geveldeelId }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [projectdeel, setProjectdeel] = useState<Projectdeel | null>(null)
  const [locaties, setLocaties] = useState<Locatie[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [saving, setSaving] = useState(false)

  function laden() {
    setProject(getAllProjecten().find((x) => x.id === projectId) || null)
    setProjectdeel(getAllProjectdelen().find((x) => x.id === geveldeelId) || null)
    setLocaties(getLocatiesVoorProjectdeel(geveldeelId))
  }

  useEffect(() => { laden() }, [projectId, geveldeelId])

  async function voegLocatieToe() {
    if (!nieuwNaam.trim()) return
    setSaving(true)
    const nieuw: Locatie = {
      id: `loc-${Date.now()}`,
      projectdeel_id: geveldeelId,
      project_id: projectId,
      naam: nieuwNaam.trim(),
      omschrijving: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    saveLocatie(nieuw)
    setNieuwNaam('')
    setShowAddForm(false)
    setSaving(false)
    laden()
  }

  function verwijderLocatie(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Locatie verwijderen?')) return
    deleteLocatie(id)
    laden()
  }

  if (!projectdeel || !project) return (
    <div className="flex items-center justify-center h-40 text-slate-400">Niet gevonden</div>
  )

  return (
    <div className="max-w-3xl space-y-6 pb-20 lg:pb-0">
      <div>
        <Link
          href={`/projecten/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {project.name}
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{projectdeel.naam}</h1>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-everts" />
            Locaties
          </h2>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="inline-flex items-center gap-1.5 bg-everts hover:bg-everts-dark text-white font-medium px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Locatie
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={nieuwNaam}
              onChange={e => setNieuwNaam(e.target.value)}
              placeholder="Naam locatie..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && voegLocatieToe()}
            />
            <div className="flex gap-2">
              <button onClick={voegLocatieToe} disabled={!nieuwNaam.trim() || saving}
                className="bg-everts hover:bg-everts-dark disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm">
                Toevoegen
              </button>
              <button onClick={() => { setShowAddForm(false); setNieuwNaam('') }}
                className="bg-white border border-slate-300 text-slate-600 font-medium px-4 py-2 rounded-lg text-sm">
                Annuleren
              </button>
            </div>
          </div>
        )}

        {locaties.map(locatie => {
          const reps = getReparatiesVoorLocatie(locatie.id)
          return (
            <Link key={locatie.id}
              href={`/projecten/${projectId}/projectdelen/${geveldeelId}/locaties/${locatie.id}`}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-everts/40 hover:shadow-sm transition-all flex items-center gap-4 group"
            >
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 group-hover:text-everts transition-colors truncate">
                  {locatie.naam}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" />{reps.length} reparatie{reps.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => verwijderLocatie(locatie.id, e)}
                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-everts transition-colors" />
              </div>
            </Link>
          )
        })}

        {locaties.length === 0 && !showAddForm && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">Nog geen locaties</p>
          </div>
        )}
      </div>
    </div>
  )
}
