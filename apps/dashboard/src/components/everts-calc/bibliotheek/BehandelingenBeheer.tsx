'use client'

import { useState, useTransition } from 'react'
import { Search, Plus, Pencil, Trash2, X, Check, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import {
  maakBehandeling, updateBehandeling, verwijderBehandeling, toggleBehandelingActief,
} from '@/app/(platform)/everts-calc/actions/behandelingen'
import type { Database } from '@/lib/everts-calc/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type DbPaintTreatment = Database['public']['Tables']['paint_treatments']['Row']

// ─── Inline bewerkbare rij ────────────────────────────────────────────────────

function BehandelingRij({
  behandeling,
  onVerwijder,
}: {
  behandeling: DbPaintTreatment
  onVerwijder: () => void
}) {
  const [, start] = useTransition()
  const [bewerkModus, setBewerkModus] = useState(false)
  const [code, setCode] = useState(behandeling.treatment_code ?? '')
  const [naam, setNaam] = useState(behandeling.name)

  const sla = () => {
    if (!code || !naam) { toast.error('Vul code en naam in'); return }
    start(async () => {
      try {
        await updateBehandeling(behandeling.id, { treatment_code: code, name: naam })
        toast.success('Opgeslagen')
        setBewerkModus(false)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })
  }

  const toggle = () =>
    start(async () => {
      try { await toggleBehandelingActief(behandeling.id, !behandeling.active) }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  const verwijder = () => {
    if (!confirm(`Behandeling "${behandeling.name}" verwijderen?`)) return
    start(async () => {
      try { await verwijderBehandeling(behandeling.id); onVerwijder() }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })
  }

  if (bewerkModus) {
    return (
      <tr className="bg-everts/5">
        <td className="px-4 py-2">
          <input
            value={code} onChange={e => setCode(e.target.value)}
            autoFocus
            className="w-full px-2 py-1.5 border border-everts rounded text-sm  focus:outline-none"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={naam} onChange={e => setNaam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sla()}
            className="w-full px-2 py-1.5 border border-everts rounded text-sm focus:outline-none"
          />
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            <Button onClick={sla} variant="primary" size="icon-sm" title="Opslaan">
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={() => { setCode(behandeling.treatment_code ?? ''); setNaam(behandeling.name); setBewerkModus(false) }}
              variant="ghost" size="icon-sm" title="Annuleren">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`group hover:bg-slate-50 transition-colors ${!behandeling.active ? 'opacity-40' : ''}`}>
      <td className="px-4 py-3">
        <span className=" text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
          {behandeling.treatment_code ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-slate-800">{behandeling.name}</td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${behandeling.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
          {behandeling.active ? 'Actief' : 'Inactief'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button onClick={() => setBewerkModus(true)} variant="ghost" size="icon-sm" title="Bewerken">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={toggle} variant="ghost" size="icon-sm" title={behandeling.active ? 'Deactiveren' : 'Activeren'}>
            <EyeOff className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={verwijder} variant="ghost" size="icon-sm" title="Verwijderen"
            className="hover:text-error-500 hover:bg-error-50">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

interface Props {
  behandelingen: DbPaintTreatment[]
}

export default function BehandelingenBeheer({ behandelingen }: Props) {
  const [, start] = useTransition()
  const [zoek, setZoek]       = useState('')
  const [nieuwCode, setNieuwCode] = useState('')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)

  const gefilterd = behandelingen.filter(b => {
    if (!zoek) return true
    const q = zoek.toLowerCase()
    return b.name.toLowerCase().includes(q) || (b.treatment_code ?? '').toLowerCase().includes(q)
  })

  const maak = () => {
    if (!nieuwCode || !nieuwNaam) { toast.error('Vul code en naam in'); return }
    start(async () => {
      try {
        await maakBehandeling({ treatment_code: nieuwCode, name: nieuwNaam })
        toast.success('Behandeling aangemaakt')
        setNieuwCode(''); setNieuwNaam(''); setNieuwOpen(false)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Behandelingen"
        description={`${behandelingen.length} schilderbehandelingen`}
      />

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" value={zoek} onChange={e => setZoek(e.target.value)}
            placeholder="Zoeken op naam of code..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
        </div>
        <Button onClick={() => setNieuwOpen(o => !o)} variant="primary" size="lg">
          <Plus className="w-4 h-4" /> Nieuwe behandeling
        </Button>
      </div>

      {nieuwOpen && (
        <div className="bg-everts/5 border border-everts/20 rounded-xl p-4 flex gap-3 items-end">
          <div className="w-36">
            <label className="block text-xs font-medium text-slate-600 mb-1">Code *</label>
            <input
              value={nieuwCode} onChange={e => setNieuwCode(e.target.value)}
              placeholder="bijv. SCH-001"
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm  focus:outline-none focus:border-everts"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Naam *</label>
            <input
              value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)}
              placeholder="bijv. 2× Schilderen"
              onKeyDown={e => e.key === 'Enter' && maak()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
            />
          </div>
          <Button onClick={maak} variant="primary" size="md">
            Aanmaken
          </Button>
          <Button onClick={() => setNieuwOpen(false)} variant="outline" size="md">
            Annuleren
          </Button>
        </div>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Naam</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Status</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gefilterd.map(b => (
              <BehandelingRij key={b.id} behandeling={b} onVerwijder={() => {}} />
            ))}
          </tbody>
        </table>

        {gefilterd.length === 0 && (
          <EmptyState
            title="Geen behandelingen gevonden"
            description={zoek ? 'Probeer een andere zoekterm' : undefined}
            tone="neutral"
            size="sm"
          />
        )}
      </Card>
    </div>
  )
}
