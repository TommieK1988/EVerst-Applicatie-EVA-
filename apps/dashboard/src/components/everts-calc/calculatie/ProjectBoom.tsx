'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, FolderOpen, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn, nieuweId } from '@/lib/everts-calc/utils'
import {
  getDeelprojecten, getLocaties,
  slaDeelprojectOp, slaLocatieOp,
  verwijderDeelproject, verwijderLocatie,
} from '@/lib/everts-calc/local-store'
import type { Selectie, Deelproject, Locatie } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  projectId: string
  selectie: Selectie | null
  onSelecteer: (selectie: Selectie) => void
}

interface InlineFormProps {
  placeholder: string
  onOpslaan: (naam: string) => void
  onAnnuleer: () => void
}

function InlineForm({ placeholder, onOpslaan, onAnnuleer }: InlineFormProps) {
  const [waarde, setWaarde] = useState('')
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (waarde.trim()) onOpslaan(waarde.trim()) }}
      className="flex items-center gap-1 px-2 py-1"
    >
      <input
        autoFocus
        type="text"
        value={waarde}
        onChange={e => setWaarde(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-xs px-2 py-1 border border-everts/40 rounded focus:outline-none focus:ring-1 focus:ring-everts"
        onKeyDown={e => e.key === 'Escape' && onAnnuleer()}
      />
      <Button type="submit" variant="primary" size="sm">✓</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onAnnuleer}>✕</Button>
    </form>
  )
}

export default function ProjectBoom({ projectId, selectie, onSelecteer }: Props) {
  const [deelprojecten, setDeelprojecten] = useState<Deelproject[]>([])
  const [locaties, setLocaties]           = useState<Locatie[]>([])
  const [uitgeklapt, setUitgeklapt]       = useState<Set<string>>(new Set())
  const [toevoegen, setToevoegen]         = useState<{ type: string; parent_id: string } | null>(null)

  const laad = () => {
    const dps = getDeelprojecten(projectId).sort((a, b) => a.volgorde - b.volgorde)
    setDeelprojecten(dps)
    const locs = dps.flatMap(dp => getLocaties(dp.id)).sort((a, b) => a.volgorde - b.volgorde)
    setLocaties(locs)
    if (dps.length > 0) {
      setUitgeklapt(new Set(dps.map(d => d.id)))
    }
  }

  useEffect(() => { laad() }, [projectId])

  const toggleUitgeklapt = (id: string) => {
    setUitgeklapt(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const isActief = (type: Selectie['type'], id: string) =>
    selectie?.type === type && selectie.id === id

  const voegDeelprojectToe = (naam: string) => {
    const dp: Deelproject = {
      id: nieuweId(), project_id: projectId,
      naam, volgorde: deelprojecten.length + 1,
    }
    slaDeelprojectOp(dp)
    laad()
    setToevoegen(null)
    toast.success('Deelproject toegevoegd')
  }

  const voegLocatieToe = (deelproject_id: string, naam: string) => {
    const locs = locaties.filter(l => l.deelproject_id === deelproject_id)
    const loc: Locatie = {
      id: nieuweId(), deelproject_id, naam, volgorde: locs.length + 1,
    }
    slaLocatieOp(loc)
    laad()
    setToevoegen(null)
    toast.success('Locatie toegevoegd')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Structuur</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setToevoegen({ type: 'deelproject', parent_id: projectId })}
          title="Deelproject toevoegen"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {toevoegen?.type === 'deelproject' && (
          <InlineForm
            placeholder="Naam deelproject..."
            onOpslaan={voegDeelprojectToe}
            onAnnuleer={() => setToevoegen(null)}
          />
        )}

        {deelprojecten.map(dp => {
          const dpLocaties = locaties.filter(l => l.deelproject_id === dp.id)
          const isOpen = uitgeklapt.has(dp.id)

          return (
            <div key={dp.id}>
              {/* Deelproject rij */}
              <div className="flex items-center group px-2 py-0.5">
                <button
                  onClick={() => toggleUitgeklapt(dp.id)}
                  className="p-0.5 text-slate-400 flex-shrink-0"
                >
                  {isOpen
                    ? <ChevronDown className="w-3.5 h-3.5" />
                    : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => toggleUitgeklapt(dp.id)}
                  className={cn(
                    'flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-left',
                    isActief('deelproject', dp.id)
                      ? 'bg-everts-50 text-everts-dark'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-everts" />
                  <span className="truncate">{dp.naam}</span>
                </button>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setToevoegen({ type: 'locatie', parent_id: dp.id })}
                    title="Locatie toevoegen"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { verwijderDeelproject(dp.id); laad(); toast.success('Verwijderd') }}
                    className="hover:text-error-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="pl-6">
                  {toevoegen?.type === 'locatie' && toevoegen.parent_id === dp.id && (
                    <InlineForm
                      placeholder="Naam locatie..."
                      onOpslaan={(naam) => voegLocatieToe(dp.id, naam)}
                      onAnnuleer={() => setToevoegen(null)}
                    />
                  )}

                  {dpLocaties.map(loc => (
                    <div key={loc.id} className="flex items-center group px-1 py-0.5">
                      <button
                        onClick={() => onSelecteer({ type: 'locatie', id: loc.id })}
                        className={cn(
                          'flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left',
                          isActief('locatie', loc.id)
                            ? 'bg-everts-50 text-everts-dark font-medium border border-everts/20'
                            : 'text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{loc.naam}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => { verwijderLocatie(loc.id); laad(); toast.success('Verwijderd') }}
                        className="opacity-0 group-hover:opacity-100 hover:text-error-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {deelprojecten.length === 0 && !toevoegen && (
          <EmptyState
            size="sm"
            tone="neutral"
            title="Nog geen structuur"
            description="Voeg een deelproject toe om te beginnen."
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setToevoegen({ type: 'deelproject', parent_id: projectId })}
              >
                <Plus className="w-3.5 h-3.5" />
                Eerste deelproject
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}
