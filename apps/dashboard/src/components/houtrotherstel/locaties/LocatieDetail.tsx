'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, ChevronRight, ClipboardList, Trash2, CheckCircle, Circle, Clock, Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getAllProjecten, getAllProjectdelen, getAllLocaties,
  getRegistratiesVoorLocatie, saveRegistratie, deleteRegistratie,
  getReparatiesVoorLocatie, getMedewerkerNaam,
} from '@/lib/houtrotherstel/local-store'
import type { Project, Projectdeel, Locatie, Registratie, RegistratieStatus } from '@/lib/houtrotherstel/types'

interface Props {
  projectId: string
  projectdeelId: string
  locatieId: string
}

function StatusBadge({ status }: { status: RegistratieStatus }) {
  if (status === 'afgerond') {
    return (
      <span className="px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
        Afgerond
      </span>
    )
  }
  if (status === 'onderhanden') {
    return (
      <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
        Onderhanden
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
      Geregistreerd
    </span>
  )
}

function StatusIcon({ status }: { status: RegistratieStatus }) {
  if (status === 'afgerond') return <CheckCircle className="w-5 h-5 text-green-500" />
  if (status === 'onderhanden') return <Clock className="w-5 h-5 text-amber-400" />
  return <Circle className="w-5 h-5 text-slate-400" />
}

export default function LocatieDetail({ projectId, projectdeelId, locatieId }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [projectdeel, setProjectdeel] = useState<Projectdeel | null>(null)
  const [locatie, setLocatie] = useState<Locatie | null>(null)
  const [registraties, setRegistraties] = useState<Registratie[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [nieuwDatum, setNieuwDatum] = useState(new Date().toISOString().slice(0, 10))
  const [nieuwMedewerker, setNieuwMedewerker] = useState(() =>
    typeof window !== 'undefined' ? getMedewerkerNaam() : ''
  )
  const [nieuwOmschrijving, setNieuwOmschrijving] = useState('')
  const [saving, setSaving] = useState(false)

  function laden() {
    setProject(getAllProjecten().find(x => x.id === projectId) || null)
    setProjectdeel(getAllProjectdelen().find(x => x.id === projectdeelId) || null)
    setLocatie(getAllLocaties().find(x => x.id === locatieId) || null)
    setRegistraties(getRegistratiesVoorLocatie(locatieId))
  }

  useEffect(() => { laden() }, [locatieId])

  function voegRegistratieToe() {
    if (!nieuwDatum) return
    setSaving(true)
    const nieuw: Registratie = {
      id: `reg-${Date.now()}`,
      locatie_id: locatieId,
      projectdeel_id: projectdeelId,
      project_id: projectId,
      datum: nieuwDatum,
      medewerker: nieuwMedewerker.trim() || null,
      omschrijving: nieuwOmschrijving.trim() || null,
      voor_foto: null,
      na_foto: null,
      status: 'geregistreerd',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    saveRegistratie(nieuw)
    setNieuwDatum(new Date().toISOString().slice(0, 10))
    setNieuwMedewerker(getMedewerkerNaam())
    setNieuwOmschrijving('')
    setShowAddForm(false)
    setSaving(false)
    laden()
  }

  function verwijderRegistratie(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Registratie verwijderen? Dit verwijdert ook alle reparaties.')) return
    deleteRegistratie(id)
    laden()
  }

  if (!locatie || !projectdeel || !project) return (
    <div className="flex items-center justify-center h-40 text-slate-400">Niet gevonden</div>
  )

  const alleReparaties = getReparatiesVoorLocatie(locatieId)
  const aantalOpen = alleReparaties.length
  const aantalGereed = registraties.filter(r => r.status === 'afgerond').length

  return (
    <div className="max-w-2xl space-y-6 pb-20 lg:pb-0">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projecten/${projectId}/projectdelen/${projectdeelId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {projectdeel.naam}
        </Link>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Locatie</p>
        <h1 className="text-xl font-bold text-slate-900">{locatie.naam}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{project.name} · {projectdeel.naam}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-700">{registraties.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Registraties</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-everts">{aantalOpen}</div>
          <div className="text-xs text-slate-500 mt-0.5">Reparaties</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{aantalGereed}</div>
          <div className="text-xs text-slate-500 mt-0.5">Afgerond</div>
        </Card>
      </div>

      {/* Registraties */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-everts" />
            Registraties
          </h2>
          <Button variant="primary" size="md" onClick={() => setShowAddForm(v => !v)}>
            <Plus className="w-4 h-4" />
            Registratie
          </Button>
        </div>

        {showAddForm && (
          <Card>
            <CardBody className="space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Nieuwe registratie</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Datum</label>
                <input
                  type="date"
                  value={nieuwDatum}
                  onChange={e => setNieuwDatum(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Medewerker</label>
                <input
                  type="text"
                  value={nieuwMedewerker}
                  onChange={e => setNieuwMedewerker(e.target.value)}
                  placeholder="Naam medewerker"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Schadeomschrijving (optioneel)</label>
              <textarea
                value={nieuwOmschrijving}
                onChange={e => setNieuwOmschrijving(e.target.value)}
                placeholder="Omschrijf de aangetroffen schade..."
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={voegRegistratieToe}
                disabled={!nieuwDatum || saving}
                loading={saving}
              >
                Aanmaken
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => { setShowAddForm(false); setNieuwMedewerker(getMedewerkerNaam()); setNieuwOmschrijving('') }}
              >
                Annuleren
              </Button>
            </div>
            </CardBody>
          </Card>
        )}

        {registraties.map(reg => {
          const repsVoorReg = alleReparaties.filter(r => r.registratie_id === reg.id)
          const datum = new Date(reg.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

          return (
            <Link
              key={reg.id}
              href={`/projecten/${projectId}/projectdelen/${projectdeelId}/locaties/${locatieId}/registraties/${reg.id}`}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-everts/40 hover:shadow-sm transition-all flex items-center gap-4 group"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                <StatusIcon status={reg.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 group-hover:text-everts transition-colors">{datum}</span>
                  {reg.medewerker && (
                    <span className="text-xs text-slate-400">· {reg.medewerker}</span>
                  )}
                </div>
                {reg.omschrijving && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{reg.omschrijving}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Wrench className="w-3 h-3" />{repsVoorReg.length} reparatie{repsVoorReg.length !== 1 ? 's' : ''}
                  </span>
                  <StatusBadge status={reg.status} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={e => verwijderRegistratie(reg.id, e)}
                  className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-everts transition-colors" />
              </div>
            </Link>
          )
        })}

        {registraties.length === 0 && !showAddForm && (
          <Card className="border-dashed">
            <EmptyState
              icon={<ClipboardList className="w-6 h-6" />}
              title="Nog geen registraties"
              description="Maak een registratie aan voor een werkbezoek of inspectie"
              tone="neutral"
            />
          </Card>
        )}
      </div>
    </div>
  )
}
