'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, List, LayoutGrid, ChevronDown, ChevronRight, Zap, FileText } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import PageHeader from '@/components/taken/shared/PageHeader'
import TaakLijstWeergave from './TaakLijstWeergave'
import KanbanBord from './KanbanBord'
import NieuweTaakDialog from './NieuweTaakDialog'
import { updateActielijst } from '@/app/(platform)/taken/actions/taken'
import type { ActielijstMetTaken } from '@/lib/taken/supabase/database.types'

interface Props {
  lijst: ActielijstMetTaken
}

const AANVRAAG_SUBSTATUSSEN = [
  { value: 'nieuw',             label: 'Nieuw' },
  { value: 'inlezen_aanvraag',  label: 'Inlezen aanvraag' },
  { value: 'werkopname',        label: 'Werkopname' },
  { value: 'uitwerken_begroting', label: 'Uitwerken begroting' },
  { value: 'controle_begroting',  label: 'Controle begroting' },
  { value: 'offerte_gereed',    label: 'Offerte gereed' },
  { value: 'verzonden',         label: 'Verzonden' },
  { value: 'afgewezen',         label: 'Afgewezen' },
  { value: 'vervallen',         label: 'Vervallen' },
]

const OFFERTE_SUBSTATUSSEN = [
  { value: 'concept',               label: 'Concept' },
  { value: 'verzonden',             label: 'Verzonden' },
  { value: 'nabellen',              label: 'Nabellen' },
  { value: 'in_behandeling',        label: 'In behandeling' },
  { value: 'mondelinge_toezegging', label: 'Mondelinge toezegging' },
  { value: 'gewonnen',              label: 'Gewonnen' },
  { value: 'verloren',              label: 'Verloren' },
  { value: 'vervallen',             label: 'Vervallen' },
]

const OPDRACHT_SUBSTATUSSEN = [
  { value: 'nieuwe_opdracht',        label: 'Nieuwe opdracht' },
  { value: 'werkvoorbereiding',      label: 'Werkvoorbereiding' },
  { value: 'onderhanden',            label: 'Onderhanden' },
  { value: 'uitvoering_gereed',      label: 'Uitvoering gereed' },
  { value: 'financieel_gereed',      label: 'Financieel gereed' },
  { value: 'financieel_afgesloten',  label: 'Financieel afgesloten' },
]

const SUBSTATUSSEN_PER_FASE: Record<string, { value: string; label: string }[]> = {
  aanvraag: AANVRAAG_SUBSTATUSSEN,
  offerte:  OFFERTE_SUBSTATUSSEN,
  opdracht: OPDRACHT_SUBSTATUSSEN,
}

function SjabloonInstellingen({ lijst }: { lijst: ActielijstMetTaken }) {
  const [open, setOpen] = useState(false)
  const [hoofdstatus, setHoofdstatus] = useState(lijst.trigger_hoofdstatus ?? '')
  const [substatus, setSubstatus] = useState(lijst.trigger_substatus ?? '')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const substatusOpties = hoofdstatus ? SUBSTATUSSEN_PER_FASE[hoofdstatus] ?? [] : []

  function handleHoofdstatusChange(val: string) {
    setHoofdstatus(val)
    setSubstatus('')
  }

  function handleSave() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('naam',                lijst.naam)
      fd.set('is_template',         'true')
      fd.set('trigger_hoofdstatus', hoofdstatus)
      fd.set('trigger_substatus',   substatus)
      if (lijst.beschrijving)  fd.set('beschrijving',  lijst.beschrijving)
      if (lijst.template_naam) fd.set('template_naam', lijst.template_naam)
      await updateActielijst(lijst.id, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="mb-5 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <Zap className="w-4 h-4 text-amber-500" />
        <span className="flex-1 text-left">Sjabloon instellingen</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 py-4 bg-white border-t border-slate-200 space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-3">
              Configureer wanneer dit sjabloon automatisch wordt geactiveerd. Laat leeg voor handmatig activeren.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fase</label>
                <select
                  value={hoofdstatus}
                  onChange={e => handleHoofdstatusChange(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Handmatig activeren —</option>
                  <option value="aanvraag">Aanvraag</option>
                  <option value="offerte">Offerte</option>
                  <option value="opdracht">Opdracht</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bij status</label>
                <select
                  value={substatus}
                  onChange={e => setSubstatus(e.target.value)}
                  disabled={!hoofdstatus}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                >
                  <option value="">— Kies substatus —</option>
                  {substatusOpties.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={pending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saved ? '✓ Opgeslagen' : pending ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActielijstDetail({ lijst }: Props) {
  const [view, setView] = useState<'lijst' | 'kanban'>('lijst')
  const [isTemplate, setIsTemplate] = useState(lijst.is_template)
  const [templatePending, startTemplateTrans] = useTransition()

  function toggleSjabloon() {
    const nieuw = !isTemplate
    setIsTemplate(nieuw)
    startTemplateTrans(async () => {
      const fd = new FormData()
      fd.set('naam', lijst.naam)
      fd.set('is_template', nieuw ? 'true' : 'false')
      if (lijst.beschrijving) fd.set('beschrijving', lijst.beschrijving)
      await updateActielijst(lijst.id, fd)
    })
  }

  const voortgang = lijst.taken_count > 0
    ? Math.round((lijst.gereed_count / lijst.taken_count) * 100)
    : 0

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={lijst.naam}
        description={lijst.beschrijving ?? undefined}
        back={
          <Link href="/taken/lijsten" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Actielijsten
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSjabloon}
              disabled={templatePending}
              title={isTemplate ? 'Terug naar gewone lijst' : 'Maak sjabloon'}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                isTemplate
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              {isTemplate ? 'Sjabloon' : 'Maak sjabloon'}
            </button>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setView('lijst')}
                className={cn('p-1.5 rounded-md transition-all', view === 'lijst' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600')}
                title="Lijstweergave"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn('p-1.5 rounded-md transition-all', view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600')}
                title="Kanbanbord"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <NieuweTaakDialog defaultLijstId={lijst.id} isTemplate={isTemplate} />
          </div>
        }
      />

      {/* Sjabloon instellingen */}
      {isTemplate && <SjabloonInstellingen lijst={lijst} />}

      {/* Voortgangsbalk */}
      {lijst.taken_count > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>{lijst.gereed_count} van {lijst.taken_count} taken gereed</span>
            <span className="font-semibold text-slate-700">{voortgang}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${voortgang}%` }}
            />
          </div>
        </div>
      )}

      {/* Inhoud */}
      {lijst.taken.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
            <List className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">Nog geen taken in deze lijst</p>
          <p className="text-slate-400 text-sm mb-4">Voeg de eerste taak toe om te beginnen.</p>
          <NieuweTaakDialog defaultLijstId={lijst.id} isTemplate={isTemplate} />
        </div>
      ) : view === 'lijst' ? (
        <TaakLijstWeergave
          taken={lijst.taken}
          isTemplate={isTemplate}
          takenInLijst={lijst.taken.map(t => ({ id: t.id, titel: t.titel }))}
        />
      ) : (
        <KanbanBord
          taken={lijst.taken}
          isTemplate={isTemplate}
          takenInLijst={lijst.taken.map(t => ({ id: t.id, titel: t.titel }))}
        />
      )}
    </div>
  )
}
