'use client'

import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, Plus, Settings2, Check, X } from 'lucide-react'
import { nieuweId } from '@/lib/utils'
import { slaScenarioOp } from '@/lib/local-store'
import type { Scenario } from '@/lib/types'

interface Props {
  scenarios: Scenario[]
  actief: Scenario
  projectId: string
  onChange: (sc: Scenario) => void
  onScenariosWijzig: (scs: Scenario[]) => void
}

interface ScenarioFormData {
  naam: string
  opslag_algemene_kosten: number
  opslag_overhead: number
}

export default function ScenarioSelector({ scenarios, actief, projectId, onChange, onScenariosWijzig }: Props) {
  const [bewerkOpen, setBewerkOpen] = useState(false)
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [form, setForm] = useState<ScenarioFormData>({
    naam: actief.naam,
    opslag_algemene_kosten: actief.opslag_algemene_kosten,
    opslag_overhead: actief.opslag_overhead,
  })

  const openBewerken = () => {
    setForm({
      naam: actief.naam,
      opslag_algemene_kosten: actief.opslag_algemene_kosten,
      opslag_overhead: actief.opslag_overhead,
    })
    setBewerkOpen(true)
  }

  const slaScenarioFormOp = (bewerkId?: string) => {
    const sc: Scenario = {
      id: bewerkId ?? nieuweId(),
      project_id: projectId,
      naam: form.naam,
      is_standaard: bewerkId ? actief.is_standaard : false,
      opslag_algemene_kosten: form.opslag_algemene_kosten,
      opslag_winst_risico: 0,
      opslag_overhead: form.opslag_overhead,
    }
    slaScenarioOp(sc)
    const vernieuwd = bewerkId
      ? scenarios.map(s => s.id === bewerkId ? sc : s)
      : [...scenarios, sc]
    onScenariosWijzig(vernieuwd)
    onChange(sc)
    setBewerkOpen(false)
    setNieuwOpen(false)
    setForm({ naam: '', opslag_algemene_kosten: 8, opslag_overhead: 0 })
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
            <span className="max-w-[140px] truncate">{actief.naam}</span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[220px] z-50"
            align="end"
            sideOffset={4}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Scenario kiezen
            </div>
            {scenarios.map(sc => (
              <DropdownMenu.Item
                key={sc.id}
                onSelect={() => onChange(sc)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
              >
                <Check className={`w-3.5 h-3.5 ${sc.id === actief.id ? 'text-everts' : 'text-transparent'}`} />
                <span className="flex-1">{sc.naam}</span>
                {sc.is_standaard && (
                  <span className="text-xs text-slate-400">standaard</span>
                )}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 border-t border-slate-100" />
            <DropdownMenu.Item
              onSelect={() => {
                setForm({ naam: 'Nieuw scenario', opslag_algemene_kosten: 8, opslag_overhead: 0 })
                setNieuwOpen(true)
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-everts hover:bg-everts-50 cursor-pointer outline-none"
            >
              <Plus className="w-3.5 h-3.5" />
              Nieuw scenario
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={openBewerken}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer outline-none"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Opslagen bewerken
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Bewerk / Nieuw scenario modal */}
      {(bewerkOpen || nieuwOpen) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">
                {bewerkOpen ? 'Scenario bewerken' : 'Nieuw scenario'}
              </h3>
              <button onClick={() => { setBewerkOpen(false); setNieuwOpen(false) }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Naam scenario</label>
                <input
                  type="text"
                  value={form.naam}
                  onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
              </div>

              {[
                { key: 'opslag_algemene_kosten' as const, label: 'Standaard opslag % (AK)' },
                { key: 'opslag_overhead' as const, label: 'Overhead (%)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setBewerkOpen(false); setNieuwOpen(false) }}
                className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => slaScenarioFormOp(bewerkOpen ? actief.id : undefined)}
                className="flex-1 py-2 text-sm font-semibold text-white bg-everts hover:bg-everts-dark rounded-lg transition-colors"
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
