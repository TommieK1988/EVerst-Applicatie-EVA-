'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { maakTaak } from '@/app/(platform)/taken/actions/taken'
import { getMedewerkersVoorToewijzing, type MedewerkerKeuze } from '@/app/(platform)/taken/actions/sjablonen'
import { getGepubliceerdeFormulieren } from '@/app/(platform)/formulieren/actions'
import { zoekDossiers } from '@/lib/dossiers/actions'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type { TaskPrioriteit, DbTaskList } from '@/lib/taken/supabase/database.types'
import {
  DEADLINE_BASIS_LABELS,
  HERHALING_LABELS,
  type DeadlineBasis,
  type HerhalingInterval,
} from '@/lib/taken/deadlines'

interface Props {
  lijsten?: DbTaskList[]
  defaultLijstId?: string
  /** Toon een zoekveld om de taak (los) aan een dossier te koppelen. */
  toonDossierPicker?: boolean
  /** Vooraf gekoppeld dossier (bijv. vanaf de Taken-tab van een dossier). */
  defaultDossier?: { id: string; titel: string }
  isTemplate?: boolean
  onSuccess?: (id: string) => void
  trigger?: React.ReactNode
}

const HOOFDSTATUS_BADGE: Record<string, string> = {
  aanvraag: 'Aanvraag',
  offerte:  'Offerte',
  opdracht: 'Opdracht',
}

const PRIORITEITEN: { value: TaskPrioriteit; label: string }[] = [
  { value: 'laag',    label: 'Laag' },
  { value: 'normaal', label: 'Normaal' },
  { value: 'hoog',    label: 'Hoog' },
  { value: 'urgent',  label: 'Urgent' },
]

const DOSSIER_ROLLEN = [
  { value: 'project_manager_id',  label: 'Projectleider' },
  { value: 'teamleider_id',       label: 'Teamleider' },
  { value: 'werkvoorbereider_id', label: 'Werkvoorbereider' },
  { value: 'calculator_id',       label: 'Calculator' },
  { value: 'uitvoerder_id',       label: 'Uitvoerder' },
  { value: 'controller_id',       label: 'Controller' },
]

const ASSIGNEE_ROLLEN = [
  { value: 'verantwoordelijke', label: 'Verantwoordelijke' },
  { value: 'mede-uitvoerder',   label: 'Mede-uitvoerder' },
  { value: 'reviewer',          label: 'Reviewer' },
]

type AssigneeKeuze = { user_id: string; rol: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer' }

export default function NieuweTaakDialog({ lijsten, defaultLijstId, toonDossierPicker, defaultDossier, isTemplate, onSuccess, trigger }: Props) {
  const [open, setOpen]                     = useState(false)
  const [pending, startTransition]          = useTransition()
  const [titel, setTitel]                   = useState('')
  const [prioriteit, setPrioriteit]         = useState<TaskPrioriteit>('normaal')
  const [deadline, setDeadline]             = useState('')
  const [lijstId, setLijstId]               = useState(defaultLijstId ?? '')
  const [dossierId, setDossierId]           = useState(defaultDossier?.id ?? '')
  const [dossierOpties, setDossierOpties]   = useState<ComboboxOption[]>(
    defaultDossier ? [{ value: defaultDossier.id, label: defaultDossier.titel }] : []
  )

  // Template-specifieke velden
  const [assigneeType, setAssigneeType]     = useState<'direct' | 'dossier_rol'>('direct')
  const [geselecteerdeAssignees, setGeselecteerdeAssignees] = useState<AssigneeKeuze[]>([])
  const [dossierRollen, setDossierRollen]   = useState<string[]>(['project_manager_id'])
  const [deadlineBasis, setDeadlineBasis]       = useState<DeadlineBasis>('geen')
  const [deadlineDagen, setDeadlineDagen]       = useState('')
  const [deadlineRichting, setDeadlineRichting] = useState<'voor' | 'na'>('voor')
  const [herhalingInterval, setHerhalingInterval] = useState<HerhalingInterval>('geen')
  const [medewerkers, setMedewerkers]       = useState<MedewerkerKeuze[]>([])
  const [formulierTemplateId, setFormulierTemplateId] = useState('')
  const [formulieren, setFormulieren]       = useState<{ id: string; naam: string; categorie: string | null }[]>([])

  useEffect(() => {
    if (open) {
      getMedewerkersVoorToewijzing().then(setMedewerkers)
      getGepubliceerdeFormulieren().then(setFormulieren)
    }
  }, [open])

  function toggleAssignee(userId: string) {
    setGeselecteerdeAssignees(prev => {
      if (prev.find(a => a.user_id === userId)) return prev.filter(a => a.user_id !== userId)
      return [...prev, { user_id: userId, rol: 'verantwoordelijke' }]
    })
  }

  function setAssigneeRol(userId: string, rol: AssigneeKeuze['rol']) {
    setGeselecteerdeAssignees(prev => prev.map(a => a.user_id === userId ? { ...a, rol } : a))
  }

  function toggleDossierRol(rol: string) {
    setDossierRollen(prev =>
      prev.includes(rol) ? prev.filter(r => r !== rol) : [...prev, rol]
    )
  }

  function zoekDossierOpties(query: string) {
    if (!query.trim()) { setDossierOpties([]); return }
    zoekDossiers(query).then(rs => setDossierOpties(rs.map(r => ({
      value: r.id,
      label: r.titel,
      sub:   r.klant_naam ?? undefined,
      badge: HOOFDSTATUS_BADGE[r.hoofdstatus] ?? undefined,
    }))))
  }

  const reset = () => {
    setTitel('')
    setPrioriteit('normaal')
    setDeadline('')
    setLijstId(defaultLijstId ?? '')
    setDossierId(defaultDossier?.id ?? '')
    setDossierOpties(defaultDossier ? [{ value: defaultDossier.id, label: defaultDossier.titel }] : [])
    setAssigneeType('direct')
    setGeselecteerdeAssignees([])
    setDossierRollen(['project_manager_id'])
    setDeadlineBasis('geen')
    setDeadlineDagen('')
    setDeadlineRichting('voor')
    setHerhalingInterval('geen')
    setFormulierTemplateId('')
  }

  // Een herhalende taak krijgt per keer zijn eigen datum uit de detailplanning;
  // een los anker zou daar niets aan toe te voegen hebben.
  const herhaalt = isTemplate && herhalingInterval !== 'geen'
  const effectieveBasis: DeadlineBasis = herhaalt ? 'geen' : deadlineBasis
  const dagenGetal = deadlineDagen ? parseInt(deadlineDagen) : null
  const effectieveDagen =
    effectieveBasis === 'geen' || dagenGetal == null
      ? null
      : effectieveBasis !== 'activatie' && deadlineRichting === 'voor'
        ? -dagenGetal
        : dagenGetal

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titel.trim()) return

    startTransition(async () => {
      await maakTaak({
        titel:      titel.trim(),
        prioriteit,
        lijst_id:   lijstId || undefined,
        // Bij een gekozen actielijst is de lijst leidend voor de dossier-koppeling
        dossier_id: !isTemplate && !lijstId && dossierId ? dossierId : undefined,
        // Deadline afhankelijk van mode: een echte taak krijgt een datum,
        // een sjabloontaak een anker waaruit de datum later volgt.
        deadline: (!isTemplate && deadline) ? deadline : undefined,
        deadline_basis: isTemplate ? effectieveBasis : undefined,
        deadline_dagen: isTemplate ? effectieveDagen : undefined,
        herhaling_interval: isTemplate ? herhalingInterval : undefined,
        // Toewijzing
        assignee_type: isTemplate ? assigneeType : 'direct',
        dossier_rollen: isTemplate && assigneeType === 'dossier_rol' ? dossierRollen : undefined,
        assignees:
          (!isTemplate || assigneeType === 'direct') && geselecteerdeAssignees.length > 0
            ? geselecteerdeAssignees
            : undefined,
        // Formulier
        formulier_template_id: formulierTemplateId || undefined,
      })

      reset()
      setOpen(false)
      onSuccess?.('')
    })
  }

  return (
    <>
      <div onClick={() => setOpen(true)}>
        {trigger ?? (
          <button className="inline-flex items-center gap-2 bg-everts text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-everts/90 transition-colors">
            <Plus className="w-4 h-4" />
            Nieuwe taak
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h2 className="text-base font-semibold text-slate-900">Nieuwe taak</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Titel */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Taak *</label>
                <input
                  autoFocus
                  type="text"
                  value={titel}
                  onChange={e => setTitel(e.target.value)}
                  placeholder="Wat moet er gedaan worden?"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                />
              </div>

              {/* Prioriteit */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Prioriteit</label>
                <div className="relative">
                  <select
                    value={prioriteit}
                    onChange={e => setPrioriteit(e.target.value as TaskPrioriteit)}
                    className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white pr-8"
                  >
                    {PRIORITEITEN.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Dossier-koppeling (losse taak) */}
              {!isTemplate && (toonDossierPicker || defaultDossier) && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Dossier
                    <span className="text-slate-400 font-normal ml-1">(optioneel)</span>
                  </label>
                  {defaultDossier ? (
                    <div className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-slate-50">
                      {defaultDossier.titel}
                    </div>
                  ) : (
                    <Combobox
                      options={dossierOpties}
                      value={dossierId}
                      onChange={setDossierId}
                      onSearch={zoekDossierOpties}
                      placeholder="Koppel aan een dossier…"
                      searchPlaceholder="Zoek op dossiertitel…"
                      emptyText="Geen dossiers gevonden."
                    />
                  )}
                  {lijstId && dossierId && (
                    <p className="text-xs text-slate-500 mt-1">
                      Er is ook een actielijst gekozen — de taak wordt aan die lijst (en het bijbehorende dossier) gekoppeld.
                    </p>
                  )}
                </div>
              )}

              {/* Toewijzing */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Toewijzing</p>

                {/* Sjabloon: keuze tussen vaste medewerker of dossier-rol */}
                {isTemplate && (
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assignee_type"
                        checked={assigneeType === 'direct'}
                        onChange={() => setAssigneeType('direct')}
                        className="accent-everts"
                      />
                      <span className="text-sm text-slate-700">Vaste medewerker</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assignee_type"
                        checked={assigneeType === 'dossier_rol'}
                        onChange={() => setAssigneeType('dossier_rol')}
                        className="accent-everts"
                      />
                      <span className="text-sm text-slate-700">Rol in dossier</span>
                    </label>
                  </div>
                )}

                {/* Medewerker checkboxes: altijd (gewone taak) of bij 'direct' (sjabloon) */}
                {(!isTemplate || assigneeType === 'direct') && (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {medewerkers.filter(m => m.auth_user_id).length === 0 && (
                      <p className="text-xs text-slate-400">Geen medewerkers beschikbaar</p>
                    )}
                    {medewerkers.filter(m => m.auth_user_id).map(m => {
                      const geselecteerd = geselecteerdeAssignees.find(a => a.user_id === m.auth_user_id!)
                      return (
                        <div key={m.auth_user_id!} className="flex items-center gap-2">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={!!geselecteerd}
                              onChange={() => toggleAssignee(m.auth_user_id!)}
                              className="accent-everts flex-shrink-0"
                            />
                            <span className="text-sm text-slate-700 truncate">{m.naam}</span>
                          </label>
                          {geselecteerd && (
                            <select
                              value={geselecteerd.rol}
                              onChange={e => setAssigneeRol(m.auth_user_id!, e.target.value as AssigneeKeuze['rol'])}
                              className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-everts/30"
                            >
                              {ASSIGNEE_ROLLEN.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {isTemplate && assigneeType === 'dossier_rol' && (
                  <div className="space-y-1.5">
                    {DOSSIER_ROLLEN.map(r => (
                      <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dossierRollen.includes(r.value)}
                          onChange={() => toggleDossierRol(r.value)}
                          className="accent-everts flex-shrink-0"
                        />
                        <span className="text-sm text-slate-700">{r.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Deadline — direct of sjabloon-offsets */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Deadline</p>

                {isTemplate ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Herhalen</label>
                      <select
                        value={herhalingInterval}
                        onChange={e => setHerhalingInterval(e.target.value as HerhalingInterval)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                      >
                        {(Object.keys(HERHALING_LABELS) as HerhalingInterval[]).map(k => (
                          <option key={k} value={k}>{HERHALING_LABELS[k]}</option>
                        ))}
                      </select>
                      {herhaalt && (
                        <p className="mt-1.5 text-xs text-slate-500 leading-snug">
                          Er ontstaat één taak per keer, verdeeld over de uitvoering volgens de
                          detailplanning van het dossier. Elke taak krijgt zijn eigen deadline.
                        </p>
                      )}
                    </div>

                    {!herhaalt && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">Deadline bepalen op</label>
                          <select
                            value={deadlineBasis}
                            onChange={e => setDeadlineBasis(e.target.value as DeadlineBasis)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                          >
                            {(Object.keys(DEADLINE_BASIS_LABELS) as DeadlineBasis[]).map(k => (
                              <option key={k} value={k}>{DEADLINE_BASIS_LABELS[k]}</option>
                            ))}
                          </select>
                          {deadlineBasis === 'streefdatum' && (
                            <p className="mt-1.5 text-xs text-slate-500 leading-snug">
                              Alleen gevuld als iemand de lijst zelf activeert en een
                              streefdatum invult. Wordt de lijst automatisch geactiveerd,
                              kies dan een datum van het dossier.
                            </p>
                          )}
                        </div>

                        {deadlineBasis !== 'geen' && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="number"
                              min={0}
                              value={deadlineDagen}
                              onChange={e => setDeadlineDagen(e.target.value)}
                              placeholder="Bijv. 3"
                              className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                            />
                            <span className="text-sm text-slate-600">dagen</span>
                            {deadlineBasis === 'activatie' ? (
                              <span className="text-sm text-slate-600">na</span>
                            ) : (
                              <select
                                value={deadlineRichting}
                                onChange={e => setDeadlineRichting(e.target.value as 'voor' | 'na')}
                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/30"
                              >
                                <option value="voor">vóór</option>
                                <option value="na">na</option>
                              </select>
                            )}
                            <span className="text-sm text-slate-600">
                              {DEADLINE_BASIS_LABELS[deadlineBasis].toLowerCase()}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                  />
                )}
              </div>

              {/* Actielijst */}
              {lijsten && lijsten.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Actielijst</label>
                  <div className="relative">
                    <select
                      value={lijstId}
                      onChange={e => setLijstId(e.target.value)}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white pr-8"
                    >
                      <option value="">Geen lijst</option>
                      {lijsten.map(l => (
                        <option key={l.id} value={l.id}>{l.naam}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Formulier koppelen */}
              {formulieren.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Formulier koppelen
                    <span className="text-slate-400 font-normal ml-1">(optioneel)</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formulierTemplateId}
                      onChange={e => setFormulierTemplateId(e.target.value)}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white pr-8"
                    >
                      <option value="">Geen formulier</option>
                      {formulieren.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.naam}{f.categorie ? ` (${f.categorie})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  {formulierTemplateId && (
                    <p className="text-xs text-slate-500 mt-1">
                      De toegewezen medewerker krijgt een melding om dit formulier in te vullen.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={!titel.trim() || pending}
                  className="inline-flex items-center gap-2 bg-everts text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-everts/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending ? 'Opslaan...' : 'Taak aanmaken'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
