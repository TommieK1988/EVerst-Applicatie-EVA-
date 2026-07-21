'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, Trash2, ChevronDown, Zap } from 'lucide-react'
import {
  upsertCompletionActie,
  verwijderCompletionActie,
  getCompletionActies,
  getSjablonen,
  type MedewerkerKeuze,
  getMedewerkersVoorToewijzing,
} from '@/app/(platform)/taken/actions/sjablonen'
import type { DbTaskCompletionActie, CompletionActieType, DbTaskList } from '@/lib/taken/supabase/database.types'

interface Props {
  taakId: string
}

const ACTIE_TYPES: { value: CompletionActieType; label: string }[] = [
  { value: 'dossier_substatus_wijzigen', label: 'Dossierstatus wijzigen' },
  { value: 'dossier_rol_toewijzen',      label: 'Medewerker toewijzen aan dossier' },
  { value: 'sjabloon_activeren',         label: 'Actielijst activeren' },
  { value: 'notificatie_sturen',         label: 'Notificatie sturen' },
]

const AANVRAAG_SUBSTATUSSEN = [
  'nieuw', 'inlezen_aanvraag', 'werkopname', 'uitwerken_begroting',
  'controle_begroting', 'offerte_gereed', 'verzonden', 'afgewezen', 'vervallen',
]
const OFFERTE_SUBSTATUSSEN = [
  'concept', 'verzonden', 'nabellen', 'in_behandeling',
  'mondelinge_toezegging', 'gewonnen', 'verloren', 'vervallen',
]
const OPDRACHT_SUBSTATUSSEN = [
  'nieuwe_opdracht', 'werkvoorbereiding', 'onderhanden',
  'uitvoering_gereed', 'financieel_gereed', 'financieel_afgesloten',
]

const DOSSIER_ROLLEN_OPTIES = [
  { value: 'project_manager_id', label: 'Projectleider' },
]

function ActieConfigForm({
  actieType,
  config,
  onChange,
  sjablonen,
  medewerkers,
}: {
  actieType: CompletionActieType
  config: Record<string, string>
  onChange: (c: Record<string, string>) => void
  sjablonen: DbTaskList[]
  medewerkers: MedewerkerKeuze[]
}) {
  if (actieType === 'dossier_substatus_wijzigen') {
    const fase = config.fase ?? ''
    const substatusOpties =
      fase === 'aanvraag' ? AANVRAAG_SUBSTATUSSEN
      : fase === 'offerte' ? OFFERTE_SUBSTATUSSEN
      : fase === 'opdracht' ? OPDRACHT_SUBSTATUSSEN
      : []

    return (
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="relative">
          <select
            value={fase}
            onChange={e => onChange({ fase: e.target.value, nieuwe_substatus: '' })}
            className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— Fase —</option>
            <option value="aanvraag">Aanvraag</option>
            <option value="offerte">Offerte</option>
            <option value="opdracht">Opdracht</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={config.nieuwe_substatus ?? ''}
            onChange={e => onChange({ ...config, nieuwe_substatus: e.target.value })}
            disabled={!fase}
            className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
          >
            <option value="">— Status —</option>
            {substatusOpties.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
      </div>
    )
  }

  if (actieType === 'dossier_rol_toewijzen') {
    return (
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="relative">
          <select
            value={config.dossier_veld ?? ''}
            onChange={e => onChange({ ...config, dossier_veld: e.target.value })}
            className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— Rol —</option>
            {DOSSIER_ROLLEN_OPTIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={config.medewerker_id ?? ''}
            onChange={e => onChange({ ...config, medewerker_id: e.target.value })}
            className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— Medewerker —</option>
            {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
      </div>
    )
  }

  if (actieType === 'sjabloon_activeren') {
    return (
      <div className="relative mt-2">
        <select
          value={config.template_id ?? ''}
          onChange={e => onChange({ template_id: e.target.value })}
          className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">— Kies sjabloon —</option>
          {sjablonen.map(s => <option key={s.id} value={s.id}>{s.template_naam ?? s.naam}</option>)}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
      </div>
    )
  }

  if (actieType === 'notificatie_sturen') {
    return (
      <div className="space-y-2 mt-2">
        <div className="relative">
          <select
            value={config.aan ?? 'assignees'}
            onChange={e => onChange({ ...config, aan: e.target.value })}
            className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="assignees">Toewijzingen</option>
            <option value="projectleider">Projectleider</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
        <input
          type="text"
          value={config.bericht ?? ''}
          onChange={e => onChange({ ...config, bericht: e.target.value })}
          placeholder="Berichtinhoud..."
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    )
  }

  return null
}

export default function TaakCompletionActies({ taakId }: Props) {
  const [acties, setActies]     = useState<DbTaskCompletionActie[]>([])
  const [sjablonen, setSjablonen] = useState<DbTaskList[]>([])
  const [medewerkers, setMedewerkers] = useState<MedewerkerKeuze[]>([])
  const [open, setOpen]         = useState(false)
  const [pending, startTransition] = useTransition()

  // Nieuw actie formulier
  const [nieuwType, setNieuwType] = useState<CompletionActieType>('dossier_substatus_wijzigen')
  const [nieuwConfig, setNieuwConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    getCompletionActies(taakId).then(setActies)
    // Alleen dossier-sjablonen: de vervolgacties (substatus, dossier-rol, sjabloon
    // activeren) draaien allemaal op een dossier.
    getSjablonen('dossier').then(setSjablonen as (v: unknown[]) => void)
    getMedewerkersVoorToewijzing().then(setMedewerkers)
  }, [open, taakId])

  function handleAdd() {
    startTransition(async () => {
      await upsertCompletionActie({
        task_id:    taakId,
        volgorde:   acties.length,
        actie_type: nieuwType,
        config:     nieuwConfig as Record<string, unknown>,
      })
      const updated = await getCompletionActies(taakId)
      setActies(updated)
      setNieuwConfig({})
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await verwijderCompletionActie(id)
      setActies(prev => prev.filter(a => a.id !== id))
    })
  }

  const actieLabel = (type: CompletionActieType) =>
    ACTIE_TYPES.find(a => a.value === type)?.label ?? type

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        <span className="flex-1 text-left">
          Voltooiingsacties
          {acties.length > 0 && <span className="ml-1 text-slate-400">({acties.length})</span>}
        </span>
      </button>

      {open && (
        <div className="px-3 py-3 bg-white border-t border-slate-200 space-y-3">
          {/* Bestaande acties */}
          {acties.map(actie => (
            <div key={actie.id} className="flex items-start gap-2">
              <div className="flex-1 text-xs">
                <span className="font-medium text-slate-700">{actieLabel(actie.actie_type)}</span>
                <div className="text-slate-400 mt-0.5">
                  {JSON.stringify(actie.config).slice(0, 60)}…
                </div>
              </div>
              <button
                onClick={() => handleDelete(actie.id)}
                disabled={pending}
                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Nieuw actie toevoegen */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-slate-500">Actie toevoegen</p>
            <div className="relative">
              <select
                value={nieuwType}
                onChange={e => { setNieuwType(e.target.value as CompletionActieType); setNieuwConfig({}) }}
                className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {ACTIE_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <ActieConfigForm
              actieType={nieuwType}
              config={nieuwConfig}
              onChange={setNieuwConfig}
              sjablonen={sjablonen as DbTaskList[]}
              medewerkers={medewerkers}
            />

            <button
              onClick={handleAdd}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Toevoegen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
