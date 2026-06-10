'use client'

import { useState } from 'react'
import { List, LayoutGrid, User, Plus } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import PageHeader from '@/components/taken/shared/PageHeader'
import TaakLijstWeergave from './TaakLijstWeergave'
import KanbanBord from './KanbanBord'
import NieuweTaakDialog from './NieuweTaakDialog'
import type { TaakMetDetails } from '@/lib/taken/supabase/database.types'

interface Props {
  alleTaken: TaakMetDetails[]
  mijnTaken: TaakMetDetails[]
}

type Tab   = 'mijn' | 'alle'
type View  = 'lijst' | 'kanban'

export default function TakenOverzicht({ alleTaken, mijnTaken }: Props) {
  const [tab,  setTab]  = useState<Tab>('mijn')
  const [view, setView] = useState<View>('lijst')

  const taken = tab === 'mijn' ? mijnTaken : alleTaken

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Taken"
        description="Beheer actiepunten en checklists"
        actions={<NieuweTaakDialog />}
      />

      {/* Tabs + weergave-switcher */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setTab('mijn')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              tab === 'mijn'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <User className="w-3.5 h-3.5" />
            Mijn taken
            {mijnTaken.length > 0 && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-semibold',
                tab === 'mijn' ? 'bg-everts text-white' : 'bg-slate-300 text-slate-600'
              )}>
                {mijnTaken.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('alle')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              tab === 'alle'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <List className="w-3.5 h-3.5" />
            Alle taken
            {alleTaken.length > 0 && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-semibold',
                tab === 'alle' ? 'bg-everts text-white' : 'bg-slate-300 text-slate-600'
              )}>
                {alleTaken.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setView('lijst')}
            className={cn(
              'p-1.5 rounded-md transition-all',
              view === 'lijst' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'
            )}
            title="Lijstweergave"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn(
              'p-1.5 rounded-md transition-all',
              view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'
            )}
            title="Kanbanbord"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inhoud */}
      {taken.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
            <List className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">
            {tab === 'mijn' ? 'Geen taken aan jou toegewezen' : 'Nog geen taken'}
          </p>
          <p className="text-slate-400 text-sm mb-4">
            {tab === 'mijn' ? 'Taken die aan jou worden toegewezen verschijnen hier.' : 'Maak een eerste taak aan om te beginnen.'}
          </p>
          <NieuweTaakDialog />
        </div>
      ) : view === 'lijst' ? (
        <TaakLijstWeergave taken={taken} />
      ) : (
        <KanbanBord taken={taken} />
      )}
    </div>
  )
}
