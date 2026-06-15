'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, MapPin, Calendar, Phone, Mail, User,
  ChevronRight, Layers, CheckCircle, Circle, Edit, Trash2, FileText, X
} from 'lucide-react'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { formatDate, formatCurrency } from '@/lib/houtrotherstel/utils'
import {
  getAllProjecten, getProjectdelenVoorProject, saveProjectdeel,
  deleteProjectdeel, getReparatiesVoorProject, getAllLocaties,
  getAllRegistraties,
} from '@/lib/houtrotherstel/local-store'
import type { Project, Projectdeel, Reparatie } from '@/lib/houtrotherstel/types'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  projectId: string
}

export default function ProjectDetail({ projectId }: Props) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [projectdelen, setProjectdelen] = useState<Projectdeel[]>([])
  const [reparaties, setReparaties] = useState<Reparatie[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwOmschrijving, setNieuwOmschrijving] = useState('')
  const [saving, setSaving] = useState(false)
  const [showRapportageModal, setShowRapportageModal] = useState(false)

  function laden() {
    const p = getAllProjecten().find(x => x.id === projectId)
    if (!p) return
    setProject(p)
    setProjectdelen(getProjectdelenVoorProject(projectId))
    setReparaties(getReparatiesVoorProject(projectId))
  }

  useEffect(() => { laden() }, [projectId])

  function getAantalLocaties(projectdeelId: string) {
    return getAllLocaties().filter(l => l.projectdeel_id === projectdeelId).length
  }

  function getAantalReparaties(projectdeelId: string) {
    return reparaties.filter(r => r.projectdeel_id === projectdeelId).length
  }

  function getGereedCount(projectdeelId: string) {
    const repIds = reparaties.filter(r => r.projectdeel_id === projectdeelId).map(r => r.registratie_id)
    const repIdSet = new Set(repIds)
    return getAllRegistraties().filter(r => repIdSet.has(r.id) && r.status === 'afgerond').length
  }

  async function voegProjectdeelToe() {
    if (!nieuwNaam.trim()) return
    setSaving(true)
    const nieuw: Projectdeel = {
      id: `pd-${Date.now()}`,
      project_id: projectId,
      naam: nieuwNaam.trim(),
      omschrijving: nieuwOmschrijving.trim() || null,
      volgorde: projectdelen.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    saveProjectdeel(nieuw)
    setNieuwNaam('')
    setNieuwOmschrijving('')
    setShowAddForm(false)
    setSaving(false)
    laden()
  }

  function verwijderProjectdeel(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Projectdeel verwijderen? Dit verwijdert ook alle locaties en reparaties.')) return
    deleteProjectdeel(id)
    laden()
  }

  if (!project) return (
    <div className="flex items-center justify-center h-40 text-slate-400">
      Project niet gevonden
    </div>
  )

  const totalVerkoopprijs = reparaties.reduce((s, r) => s + (r.sale_price_snapshot || 0), 0)
  const alleRegIds = new Set(reparaties.map(r => r.registratie_id))
  const alleRegsHier = getAllRegistraties().filter(r => alleRegIds.has(r.id))
  const openCount = alleRegsHier.filter(r => r.status !== 'afgerond').length
  const gereedCount = alleRegsHier.filter(r => r.status === 'afgerond').length

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <Link
          href="/houtrotherstel/projecten"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar projecten
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-slate-400 ">#{project.project_number}</span>
              <StatusBadge status={project.status} type="project" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{project.name}</h1>
            <p className="text-slate-500">{project.client_name}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowRapportageModal(true)}
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Rapportage</span>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/projecten/${project.id}/bewerken`}>
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Bewerken</span>
              </Link>
            </Button>
          </div>

          {/* Rapportage modal */}
          <Dialog open={showRapportageModal} onOpenChange={setShowRapportageModal}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Rapportage opstellen</DialogTitle>
                <DialogDescription>Wil je de rapportage met of zonder prijzen opstellen?</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 justify-stretch">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => { setShowRapportageModal(false); router.push(`/houtrotherstel/projecten/${project.id}/rapportage?prijzen=1`) }}
                >
                  Met prijzen
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => { setShowRapportageModal(false); router.push(`/houtrotherstel/projecten/${project.id}/rapportage?prijzen=0`) }}
                >
                  Zonder prijzen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-neutral-700">{projectdelen.length}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Projectdelen</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-brand-600">{openCount}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Onderhanden</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-success-700">{gereedCount}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Afgerond</div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projectinfo */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800">Projectinformatie</h2>
            <div className="flex items-start gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-slate-700">{project.address}</div>
                <div className="text-slate-500">{project.postal_code} {project.city}</div>
              </div>
            </div>
            {(project.start_date || project.end_date) && (
              <div className="flex items-start gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-slate-700">{formatDate(project.start_date || '')}</div>
                  {project.end_date && <div className="text-slate-500">t/m {formatDate(project.end_date)}</div>}
                </div>
              </div>
            )}
            {project.contact_name && (
              <div className="flex items-start gap-2.5 text-sm">
                <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-slate-700">{project.contact_name}</div>
                  {project.contact_phone && (
                    <a href={`tel:${project.contact_phone}`} className="text-everts hover:underline flex items-center gap-1">
                      <Phone className="w-3 h-3" />{project.contact_phone}
                    </a>
                  )}
                  {project.contact_email && (
                    <a href={`mailto:${project.contact_email}`} className="text-everts hover:underline flex items-center gap-1">
                      <Mail className="w-3 h-3" />{project.contact_email}
                    </a>
                  )}
                </div>
              </div>
            )}
            {project.description && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-1">Omschrijving</p>
                <p className="text-sm text-slate-600">{project.description}</p>
              </div>
            )}
          </div>

          {totalVerkoopprijs > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-3">Financieel overzicht</h2>
              <div className="text-sm text-slate-500">Verkoopwaarde</div>
              <div className="text-2xl font-bold text-slate-800">{formatCurrency(totalVerkoopprijs)}</div>
              <div className="mt-2 text-xs text-slate-400">{reparaties.length} reparaties</div>
            </div>
          )}
        </div>

        {/* Projectdelen */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-everts" />
              Projectdelen
            </h2>
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="inline-flex items-center gap-1.5 bg-everts hover:bg-everts-dark text-white
                font-medium px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Projectdeel
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="bg-everts-50 border border-everts/20 rounded-xl p-4 space-y-3">
              <h3 className="font-medium text-slate-700 text-sm">Nieuw projectdeel</h3>
              <input
                type="text"
                value={nieuwNaam}
                onChange={e => setNieuwNaam(e.target.value)}
                placeholder="Naam, bijv. Voorgevel, Achtergevel, Blok A..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && voegProjectdeelToe()}
              />
              <input
                type="text"
                value={nieuwOmschrijving}
                onChange={e => setNieuwOmschrijving(e.target.value)}
                placeholder="Omschrijving (optioneel)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
              />
              <div className="flex gap-2">
                <button
                  onClick={voegProjectdeelToe}
                  disabled={!nieuwNaam.trim() || saving}
                  className="bg-everts hover:bg-everts-dark disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Toevoegen
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNieuwNaam(''); setNieuwOmschrijving('') }}
                  className="bg-white border border-slate-300 text-slate-600 font-medium px-4 py-2 rounded-lg text-sm hover:border-slate-400 transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {/* Projectdelen list */}
          <div className="space-y-3">
            {projectdelen.map(gd => {
              const aantalLoc = getAantalLocaties(gd.id)
              const aantalRep = getAantalReparaties(gd.id)
              const gereed = getGereedCount(gd.id)
              return (
                <Link
                  key={gd.id}
                  href={`/projecten/${projectId}/projectdelen/${gd.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:border-everts/40 hover:shadow-sm transition-all flex items-center gap-4 group"
                >
                  <div className="w-10 h-10 bg-everts-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-everts" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 group-hover:text-everts transition-colors">{gd.naam}</div>
                    {gd.omschrijving && <div className="text-xs text-slate-500 truncate">{gd.omschrijving}</div>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{aantalLoc} locatie{aantalLoc !== 1 ? 's' : ''}</span>
                      <span>{aantalRep} reparatie{aantalRep !== 1 ? 's' : ''}</span>
                      {aantalRep > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" />{gereed}/{aantalRep} afgerond
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => verwijderProjectdeel(gd.id, e)}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-everts transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>

          {projectdelen.length === 0 && !showAddForm && (
            <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Nog geen projectdelen</p>
              <p className="text-sm mt-1">Voeg een projectdeel toe om te beginnen</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
