'use client'

import { useState } from 'react'
import { User, Sliders } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import InstellingenForm from '@/components/instellingen/InstellingenForm'
import AppInstellingen from '@/components/instellingen/AppInstellingen'
import { mockProfile } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'profiel', label: 'Profiel', icon: User },
  { id: 'app', label: 'App-instellingen', icon: Sliders },
]

export default function InstellingenPage() {
  const [tab, setTab] = useState<'profiel' | 'app'>('profiel')

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <PageHeader title="Instellingen" description="Beheer profiel en app-configuratie" />

      {/* Tabbladen */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'profiel' | 'app')}
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
        {tab === 'profiel' && <InstellingenForm profile={mockProfile} />}
        {tab === 'app' && <AppInstellingen />}
      </div>
    </div>
  )
}
