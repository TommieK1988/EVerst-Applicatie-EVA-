'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, List, LayoutGrid, FileText } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import PageHeader from '@/components/taken/shared/PageHeader'
import TaakLijstWeergave from './TaakLijstWeergave'
import KanbanBord from './KanbanBord'
import NieuweTaakDialog from './NieuweTaakDialog'
import SjabloonTriggers from './SjabloonTriggers'
import { updateActielijst } from '@/app/(platform)/taken/actions/taken'
import type { ActielijstMetTaken } from '@/lib/taken/supabase/database.types'

interface Props {
  lijst: ActielijstMetTaken
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
            {isTemplate && <SjabloonTriggers templateId={lijst.id} />}
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
