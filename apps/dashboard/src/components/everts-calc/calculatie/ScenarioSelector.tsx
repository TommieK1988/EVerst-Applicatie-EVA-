'use client'

import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Plus, Settings2, Check } from 'lucide-react'
import { nieuweId } from '@/lib/everts-calc/utils'
import { slaScenarioOp } from '@/lib/everts-calc/local-store'
import type { Scenario } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'

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
          <Button variant="secondary" size="sm" className="gap-1.5">
            <span className="max-w-[140px] truncate">{actief.naam}</span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
          </Button>
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
      <Dialog open={bewerkOpen || nieuwOpen} onOpenChange={open => { if (!open) { setBewerkOpen(false); setNieuwOpen(false) } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {bewerkOpen ? 'Scenario bewerken' : 'Nieuw scenario'}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-700 block mb-1.5">Naam scenario</label>
              <input
                type="text"
                value={form.naam}
                onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
              />
            </div>

            {[
              { key: 'opslag_algemene_kosten' as const, label: 'Standaard opslag % (AK)' },
              { key: 'opslag_overhead' as const, label: 'Overhead (%)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">{label}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                />
              </div>
            ))}
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              size="md"
              onClick={() => { setBewerkOpen(false); setNieuwOpen(false) }}
            >
              Annuleren
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => slaScenarioFormOp(bewerkOpen ? actief.id : undefined)}
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
