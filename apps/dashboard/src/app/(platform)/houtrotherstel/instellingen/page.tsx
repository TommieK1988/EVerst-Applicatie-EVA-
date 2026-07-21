'use client'

import { useState } from 'react'
import { Sliders } from 'lucide-react'
import PageHeader from '@/components/houtrotherstel/shared/PageHeader'
import AppInstellingen from '@/components/houtrotherstel/instellingen/AppInstellingen'
import { cn } from '@/lib/houtrotherstel/utils'

// De profiel-tab is vervallen: houtrot heeft geen eigen profielen meer. Persoons-
// gegevens beheer je in EVA (Medewerkers / Mijn gegevens).
const TABS = [
  { id: 'app', label: 'App-instellingen', icon: Sliders },
]

export default function InstellingenPage() {
  const [tab, setTab] = useState<'app'>('app')

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <PageHeader title="Instellingen" description="App-configuratie voor houtrotherstel" />

      {/* Tabbladen */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'app')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="max-w-2xl">
        {tab === 'app' && <AppInstellingen />}
      </div>
    </div>
  )
}
