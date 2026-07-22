'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Calendar, Trash2, MessageSquare, ChevronDown, Plus, Check, Clock, UserPlus, Lock, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import { omschrijvingNaarTekst } from '@/lib/taken/omschrijving'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { updateTaak, verwijderTaak, updateTaakStatus, plaatsComment, maakTaak, voegAssigneeToe, verwijderAssignee } from '@/app/(platform)/taken/actions/taken'
import { getMedewerkersVoorToewijzing, type MedewerkerKeuze } from '@/app/(platform)/taken/actions/sjablonen'
import { getGepubliceerdeFormulieren } from '@/app/(platform)/formulieren/actions'
import TaakCompletionActies from './TaakCompletionActies'
import type { TaakMetDetails, TaskStatus, TaskPrioriteit, TaskAssigneeRol } from '@/lib/taken/supabase/database.types'
import {
  DEADLINE_BASIS_LABELS,
  DOSSIER_DEADLINE_BASISSEN,
  MEDEWERKER_DEADLINE_BASISSEN,
  HERHALING_LABELS,
  type DeadlineBasis,
  type HerhalingInterval,
} from '@/lib/taken/deadlines'

interface Props {
  taak: TaakMetDetails
  onSluit: () => void
  isTemplate?: boolean
  /** Sjabloon-context: bepaalt de toewijzings- en deadline-opties. */
  context?: 'dossier' | 'medewerker'
  takenInLijst?: { id: string; titel: string }[]
}

const STATUSSEN: TaskStatus[] = ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen']
const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open', in_behandeling: 'In behandeling',
  wacht_op: 'Wacht op', gereed: 'Gereed', vervallen: 'Vervallen',
}
const PRIORITEITEN: { value: TaskPrioriteit; label: string }[] = [
  { value: 'laag', label: 'Laag' }, { value: 'normaal', label: 'Normaal' },
  { value: 'hoog', label: 'Hoog' }, { value: 'urgent', label: 'Urgent' },
]
const DOSSIER_ROLLEN = [
  { value: 'project_manager_id',  label: 'Projectleider' },
  { value: 'teamleider_id',       label: 'Teamleider' },
  { value: 'werkvoorbereider_id', label: 'Werkvoorbereider' },
  { value: 'calculator_id',       label: 'Calculator' },
  { value: 'uitvoerder_id',       label: 'Uitvoerder' },
  { value: 'controller_id',       label: 'Controller' },
]
const ASSIGNEE_ROLLEN: { value: TaskAssigneeRol; label: string }[] = [
  { value: 'verantwoordelijke', label: 'Verantwoordelijke' },
  { value: 'mede-uitvoerder',   label: 'Mede-uitvoerder' },
  { value: 'reviewer',          label: 'Reviewer' },
]

export default function TaakDetailPanel({ taak, onSluit, isTemplate, context = 'dossier', takenInLijst = [] }: Props) {
  const isMedewerkerContext = context === 'medewerker'
  const [pending, startTransition] = useTransition()
  const [editTitel, setEditTitel]   = useState(false)
  const [titel, setTitel]           = useState(taak.titel)
  const [comment, setComment]       = useState('')
  const [nieuweSubtaak, setNieuweSubtaak] = useState('')
  const [toonSubtaak, setToonSubtaak]     = useState(false)

  // Omschrijving
  const [omschrijving, setOmschrijving] = useState(omschrijvingNaarTekst(taak.omschrijving))

  // Geschatte uren
  const [geschatteUren, setGeschatteUren] = useState(taak.geschatte_uren?.toString() ?? '')

  // Assignee manager
  const [medewerkers, setMedewerkers] = useState<MedewerkerKeuze[]>([])
  const [toonAssigneeToevoegen, setToonAssigneeToevoegen] = useState(false)
  const [nieuweAssigneeId, setNieuweAssigneeId] = useState('')
  const [nieuweAssigneeRol, setNieuweAssigneeRol] = useState<TaskAssigneeRol>('verantwoordelijke')

  // Template-velden
  const [assigneeType, setAssigneeType] = useState<'direct' | 'dossier_rol' | 'medewerker_zelf'>(taak.assignee_type ?? 'direct')
  const [dossierRollen, setDossierRollen] = useState<string[]>(taak.dossier_rollen ?? [])
  const [deadlineBasis, setDeadlineBasis] = useState<DeadlineBasis>(taak.deadline_basis ?? 'geen')
  // In de DB is de offset ondertekend (negatief = ervóór); in het formulier splitsen we
  // dat in een positief aantal dagen plus een richting, want zo lees je het ook voor.
  const [deadlineDagen, setDeadlineDagen] = useState(
    taak.deadline_dagen != null ? Math.abs(taak.deadline_dagen).toString() : '',
  )
  const [deadlineRichting, setDeadlineRichting] = useState<'voor' | 'na'>(
    (taak.deadline_dagen ?? 0) < 0 ? 'voor' : 'na',
  )
  const [herhalingInterval, setHerhalingInterval] = useState<HerhalingInterval>(
    taak.herhaling_interval ?? 'geen',
  )

  // Blokkering
  const [blockedBy, setBlockedBy] = useState(taak.blocked_by_task_id ?? '')
  const [statusFout, setStatusFout] = useState<string | null>(null)

  // Formulier-koppeling
  const [formulierTemplateId, setFormulierTemplateId] = useState(taak.formulier_template_id ?? '')
  const [formulieren, setFormulieren] = useState<{ id: string; naam: string; categorie: string | null }[]>([])

  useEffect(() => {
    getMedewerkersVoorToewijzing().then(setMedewerkers)
    getGepubliceerdeFormulieren().then(setFormulieren)
  }, [])

  const handleStatusChange = (status: TaskStatus) => {
    setStatusFout(null)
    startTransition(async () => {
      try {
        await updateTaakStatus(taak.id, status)
      } catch (err) {
        setStatusFout(err instanceof Error ? err.message : 'Fout bij wijzigen status')
      }
    })
  }

  const handleTitelOpslaan = () => {
    if (!titel.trim() || titel === taak.titel) { setEditTitel(false); return }
    startTransition(async () => {
      await updateTaak(taak.id, { titel: titel.trim() })
      setEditTitel(false)
    })
  }

  const handleOmschrijvingOpslaan = () => {
    const huidig = omschrijvingNaarTekst(taak.omschrijving)
    if (omschrijving === huidig) return
    startTransition(() => updateTaak(taak.id, { beschrijving: omschrijving ? { text: omschrijving } : {} }))
  }

  const handleUrenOpslaan = () => {
    const uren = geschatteUren ? parseFloat(geschatteUren) : null
    if (uren === taak.geschatte_uren) return
    startTransition(() => updateTaak(taak.id, { geschatte_uren: uren }))
  }

  const handleVerwijderen = () => {
    if (!confirm(`Actie "${taak.titel}" verwijderen?`)) return
    startTransition(async () => {
      await verwijderTaak(taak.id)
      onSluit()
    })
  }

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    startTransition(async () => {
      await plaatsComment(taak.id, comment.trim())
      setComment('')
    })
  }

  const handleSubtaakAanmaken = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nieuweSubtaak.trim()) return
    startTransition(async () => {
      await maakTaak({ titel: nieuweSubtaak.trim(), parent_task_id: taak.id, lijst_id: taak.lijst_id ?? undefined })
      setNieuweSubtaak('')
      setToonSubtaak(false)
    })
  }

  const handleSubtaakToggle = (subId: string, huidigeStatus: string) => {
    startTransition(() => updateTaakStatus(subId, huidigeStatus === 'gereed' ? 'open' : 'gereed'))
  }

  const handleSubtaakVerwijderen = (subId: string, subTitel: string) => {
    if (!confirm(`Subactie "${subTitel}" verwijderen?`)) return
    startTransition(() => verwijderTaak(subId))
  }

  const handleAssigneeToevoegen = () => {
    if (!nieuweAssigneeId) return
    startTransition(async () => {
      await voegAssigneeToe(taak.id, nieuweAssigneeId, nieuweAssigneeRol)
      setNieuweAssigneeId('')
      setNieuweAssigneeRol('verantwoordelijke')
      setToonAssigneeToevoegen(false)
    })
  }

  const handleAssigneeVerwijderen = (userId: string) => {
    startTransition(() => verwijderAssignee(taak.id, userId))
  }

  const toggleDossierRol = (rol: string) => {
    setDossierRollen(prev =>
      prev.includes(rol) ? prev.filter(r => r !== rol) : [...prev, rol]
    )
  }

  // Een herhalende taak krijgt per keer zijn eigen datum uit de detailplanning;
  // een los anker zou daar niets aan toe te voegen hebben.
  const herhaalt = herhalingInterval !== 'geen'
  const effectieveBasis: DeadlineBasis = herhaalt ? 'geen' : deadlineBasis
  const dagenGetal = deadlineDagen ? parseInt(deadlineDagen) : null
  const effectieveDagen =
    effectieveBasis === 'geen' || dagenGetal == null
      ? null
      : effectieveBasis !== 'activatie' && deadlineRichting === 'voor'
        ? -dagenGetal
        : dagenGetal

  const handleTemplateVeldenOpslaan = () => {
    startTransition(() => updateTaak(taak.id, {
      assignee_type:  assigneeType,
      dossier_rollen: assigneeType === 'dossier_rol' ? dossierRollen : [],
      deadline_basis:     effectieveBasis,
      deadline_dagen:     effectieveDagen,
      herhaling_interval: herhalingInterval,
    }))
  }

  const handleBlockedByChange = (val: string) => {
    setBlockedBy(val)
    startTransition(() => updateTaak(taak.id, { blocked_by_task_id: val || null }))
  }

  const handleFormulierChange = (val: string) => {
    setFormulierTemplateId(val)
    startTransition(() => updateTaak(taak.id, { formulier_template_id: val || null }))
  }

  const medewerkersMap = Object.fromEntries(
    medewerkers.filter(m => m.auth_user_id).map(m => [m.auth_user_id!, m.naam])
  )
  const beschikbareAssignees = medewerkers.filter(
    m => m.auth_user_id && !taak.assignees.find(a => a.user_id === m.auth_user_id)
  )

  return (
    <div className="w-96 flex-shrink-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex-1 min-w-0 pr-2">
          {editTitel ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={titel}
                onChange={e => setTitel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTitelOpslaan(); if (e.key === 'Escape') setEditTitel(false) }}
                className="flex-1 text-sm font-semibold text-slate-900 border-b border-everts focus:outline-none bg-transparent"
              />
              <button onClick={handleTitelOpslaan} className="text-everts hover:text-everts/80">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditTitel(true)} className="text-left group w-full">
              <h3 className="text-sm font-semibold text-slate-900 leading-snug group-hover:text-everts transition-colors">
                {taak.titel}
              </h3>
            </button>
          )}
          {taak.lijst && (
            <p className="text-xs text-slate-400 mt-0.5">{taak.lijst.naam}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleVerwijderen} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onSluit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Status & prioriteit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
            <div className="relative">
              <select
                value={taak.status}
                onChange={e => handleStatusChange(e.target.value as TaskStatus)}
                className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 bg-white pr-7"
              >
                {STATUSSEN.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            {statusFout && (
              <p className="mt-1 text-xs text-red-600 leading-snug">{statusFout}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Prioriteit</label>
            <div className="relative">
              <select
                value={taak.prioriteit}
                onChange={e => startTransition(() => updateTaak(taak.id, { prioriteit: e.target.value as TaskPrioriteit }))}
                className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 bg-white pr-7"
              >
                {PRIORITEITEN.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Omschrijving */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Omschrijving</label>
          <textarea
            value={omschrijving}
            onChange={e => setOmschrijving(e.target.value)}
            onBlur={handleOmschrijvingOpslaan}
            placeholder="Voeg een omschrijving toe…"
            rows={3}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 resize-none text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-everts/30"
          />
        </div>

        {/* Deadline & uren */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              <Calendar className="inline w-3.5 h-3.5 mr-1" />
              Deadline
            </label>
            <input
              type="date"
              defaultValue={taak.deadline ? format(parseISO(taak.deadline), 'yyyy-MM-dd') : ''}
              onChange={e => startTransition(() => updateTaak(taak.id, { deadline: e.target.value || null }))}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              <Clock className="inline w-3.5 h-3.5 mr-1" />
              Geschatte uren
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={geschatteUren}
              onChange={e => setGeschatteUren(e.target.value)}
              onBlur={handleUrenOpslaan}
              placeholder="0"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
          </div>
        </div>

        {/* Geblokkeerd door */}
        {takenInLijst.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              <Lock className="inline w-3.5 h-3.5 mr-1" />
              Geblokkeerd door
            </label>
            <div className="relative">
              <select
                value={blockedBy}
                onChange={e => handleBlockedByChange(e.target.value)}
                className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 bg-white pr-7"
              >
                <option value="">— Geen blokkering —</option>
                {takenInLijst.filter(t => t.id !== taak.id).map(t => (
                  <option key={t.id} value={t.id}>{t.titel}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Formulier */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            <FileText className="inline w-3.5 h-3.5 mr-1" />
            Formulier
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={formulierTemplateId}
                onChange={e => handleFormulierChange(e.target.value)}
                className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 bg-white pr-7"
              >
                <option value="">— Geen formulier —</option>
                {formulieren.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.naam}{f.categorie ? ` (${f.categorie})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            {formulierTemplateId && (
              <a
                href={`/formulieren/${formulierTemplateId}/invullen?task_id=${taak.id}${taak.dossier_id ? `&dossier_id=${taak.dossier_id}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-everts hover:text-everts/80 border border-everts/30 rounded-lg px-2 py-1.5 hover:bg-everts/5 transition-colors"
                title="Formulier invullen"
              >
                <ExternalLink className="w-3 h-3" />
                Invullen
              </a>
            )}
          </div>
        </div>

        {/* Toewijzingen */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">Toegewezen aan</label>
            <button
              onClick={() => setToonAssigneeToevoegen(t => !t)}
              className="text-xs text-everts hover:text-everts/80 flex items-center gap-1"
            >
              <UserPlus className="w-3 h-3" /> Toevoegen
            </button>
          </div>

          {taak.assignees.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {taak.assignees.map(a => (
                <div key={a.user_id} className="flex items-center gap-2 text-xs py-1 px-2 bg-slate-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-everts flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(medewerkersMap[a.user_id] ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="flex-1 text-slate-700 truncate">{medewerkersMap[a.user_id] ?? a.user_id.slice(0, 8) + '…'}</span>
                  <span className="text-slate-400 flex-shrink-0">{a.rol}</span>
                  <button
                    onClick={() => handleAssigneeVerwijderen(a.user_id)}
                    className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {toonAssigneeToevoegen && (
            <div className="flex items-center gap-2">
              <select
                value={nieuweAssigneeId}
                onChange={e => setNieuweAssigneeId(e.target.value)}
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30"
              >
                <option value="">— Kies medewerker —</option>
                {beschikbareAssignees.map(m => (
                  <option key={m.auth_user_id!} value={m.auth_user_id!}>{m.naam}</option>
                ))}
              </select>
              <select
                value={nieuweAssigneeRol}
                onChange={e => setNieuweAssigneeRol(e.target.value as TaskAssigneeRol)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30"
              >
                {ASSIGNEE_ROLLEN.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={handleAssigneeToevoegen}
                disabled={!nieuweAssigneeId || pending}
                className="text-xs bg-everts text-white px-2 py-1.5 rounded-lg hover:bg-everts/90 disabled:opacity-50 flex-shrink-0"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          {taak.assignees.length === 0 && !toonAssigneeToevoegen && (
            <p className="text-xs text-slate-400">Nog niemand toegewezen</p>
          )}
        </div>

        {/* Template-velden */}
        {isTemplate && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Sjabloon-instellingen</p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Toewijzingstype</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name={`at-${taak.id}`} checked={assigneeType === 'direct'} onChange={() => setAssigneeType('direct')} className="accent-everts" />
                  <span className="text-xs text-slate-700">Vaste medewerker</span>
                </label>
                {isMedewerkerContext ? (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={`at-${taak.id}`} checked={assigneeType === 'medewerker_zelf'} onChange={() => setAssigneeType('medewerker_zelf')} className="accent-everts" />
                    <span className="text-xs text-slate-700">De medewerker zelf</span>
                  </label>
                ) : (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={`at-${taak.id}`} checked={assigneeType === 'dossier_rol'} onChange={() => setAssigneeType('dossier_rol')} className="accent-everts" />
                    <span className="text-xs text-slate-700">Rol in dossier</span>
                  </label>
                )}
              </div>
              {isMedewerkerContext && assigneeType === 'medewerker_zelf' && (
                <p className="mt-1 text-xs text-slate-500 leading-snug">
                  De actie komt bij de medewerker om wie deze lijst draait. Heeft die nog geen
                  EVA-account, dan blijft de actie open staan tot het account gekoppeld is.
                </p>
              )}
            </div>

            {assigneeType === 'dossier_rol' && !isMedewerkerContext && (
              <div className="space-y-1.5">
                {DOSSIER_ROLLEN.map(r => (
                  <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dossierRollen.includes(r.value)}
                      onChange={() => toggleDossierRol(r.value)}
                      className="accent-everts flex-shrink-0"
                    />
                    <span className="text-xs text-slate-700">{r.label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Herhaling hangt aan het uitvoeringsvenster van de detailplanning —
                een concept dat in de medewerker-context niet bestaat. */}
            <div className={isMedewerkerContext ? 'hidden' : undefined}>
              <label className="block text-xs font-medium text-slate-600 mb-1">Herhalen</label>
              <div className="relative">
                <select
                  value={herhalingInterval}
                  onChange={e => setHerhalingInterval(e.target.value as HerhalingInterval)}
                  className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white pr-7 focus:outline-none focus:ring-2 focus:ring-everts/30"
                >
                  {(Object.keys(HERHALING_LABELS) as HerhalingInterval[]).map(k => (
                    <option key={k} value={k}>{HERHALING_LABELS[k]}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              {herhaalt && (
                <p className="mt-1 text-xs text-slate-500 leading-snug">
                  Bij activeren ontstaat één actie per keer, verdeeld over de uitvoering volgens
                  de detailplanning van het dossier. Elke actie krijgt zijn eigen deadline.
                </p>
              )}
            </div>

            {!herhaalt && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Deadline bepalen op</label>
                  <div className="relative">
                    <select
                      value={deadlineBasis}
                      onChange={e => setDeadlineBasis(e.target.value as DeadlineBasis)}
                      className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white pr-7 focus:outline-none focus:ring-2 focus:ring-everts/30"
                    >
                      {(isMedewerkerContext ? MEDEWERKER_DEADLINE_BASISSEN : DOSSIER_DEADLINE_BASISSEN).map(k => (
                        <option key={k} value={k}>{DEADLINE_BASIS_LABELS[k]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                  {deadlineBasis === 'streefdatum' && (
                    <p className="mt-1 text-xs text-slate-500 leading-snug">
                      Alleen gevuld als iemand de lijst zelf activeert en een streefdatum
                      invult. Wordt de lijst automatisch geactiveerd, kies dan een datum
                      van het dossier — anders blijft deze actie zonder deadline.
                    </p>
                  )}
                </div>

                {deadlineBasis !== 'geen' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      value={deadlineDagen}
                      onChange={e => setDeadlineDagen(e.target.value)}
                      placeholder="0"
                      className="w-14 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-everts/30"
                    />
                    <span className="text-xs text-slate-600">dagen</span>
                    {deadlineBasis === 'activatie' ? (
                      <span className="text-xs text-slate-600">na</span>
                    ) : (
                      <select
                        value={deadlineRichting}
                        onChange={e => setDeadlineRichting(e.target.value as 'voor' | 'na')}
                        className="text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30"
                      >
                        <option value="voor">vóór</option>
                        <option value="na">na</option>
                      </select>
                    )}
                    <span className="text-xs text-slate-600">
                      {DEADLINE_BASIS_LABELS[deadlineBasis].toLowerCase()}
                    </span>
                  </div>
                )}
              </>
            )}

            <button
              onClick={handleTemplateVeldenOpslaan}
              disabled={pending}
              className="w-full text-xs bg-amber-500 text-white rounded-lg py-1.5 hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {pending ? 'Opslaan…' : 'Sjabloon-instellingen opslaan'}
            </button>
          </div>
        )}

        {/* Voltooiingsacties — alleen in sjabloon-modus */}
        {isTemplate && <TaakCompletionActies taakId={taak.id} />}

        {/* Subtaken */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">
              Subacties {taak.subtaken.length > 0 && `(${taak.subtaken.length})`}
            </label>
            <button
              onClick={() => setToonSubtaak(t => !t)}
              className="text-xs text-everts hover:text-everts/80 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Toevoegen
            </button>
          </div>

          {taak.subtaken.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {taak.subtaken.map((sub: any) => (
                <div key={sub.id} className="group flex items-center gap-2 text-xs text-slate-600 py-1 px-2 bg-slate-50 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleSubtaakToggle(sub.id, sub.status)}
                    disabled={pending}
                    title={sub.status === 'gereed' ? 'Markeer als open' : 'Markeer als gereed'}
                    className={cn(
                      'w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-50',
                      sub.status === 'gereed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-everts',
                    )}
                  >
                    {sub.status === 'gereed' && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className={cn('flex-1 truncate', sub.status === 'gereed' && 'line-through text-slate-400')}>{sub.titel}</span>
                  <button
                    type="button"
                    onClick={() => handleSubtaakVerwijderen(sub.id, sub.titel)}
                    disabled={pending}
                    title="Subactie verwijderen"
                    className="flex-shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {toonSubtaak && (
            <form onSubmit={handleSubtaakAanmaken} className="flex items-center gap-2">
              <input
                autoFocus
                value={nieuweSubtaak}
                onChange={e => setNieuweSubtaak(e.target.value)}
                placeholder="Subactie omschrijving..."
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-everts/30"
              />
              <button type="submit" disabled={!nieuweSubtaak.trim()} className="text-xs bg-everts text-white px-2.5 py-1.5 rounded-lg hover:bg-everts/90 disabled:opacity-50">
                +
              </button>
            </form>
          )}
        </div>

        {/* Comments */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">
            <MessageSquare className="inline w-3.5 h-3.5 mr-1" />
            Opmerkingen
          </label>
          <form onSubmit={handleComment} className="flex items-start gap-2">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Schrijf een opmerking..."
              rows={2}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
            <button
              type="submit"
              disabled={!comment.trim() || pending}
              className="text-xs bg-everts text-white px-2.5 py-2 rounded-lg hover:bg-everts/90 disabled:opacity-50 flex-shrink-0"
            >
              Sturen
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
