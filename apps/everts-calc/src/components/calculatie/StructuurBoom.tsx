'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, FolderOpen, Folder } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn, nieuweId } from '@/lib/utils'
import { getGroepen, slaGroepOp, verwijderGroep } from '@/lib/local-store'
import { berekeningNummers } from '@/lib/calculations'
import type { Groep } from '@/lib/types'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface Props {
  scenarioId: string
  actiefGroepId: string | null
  refreshTrigger: number
  onSelecteer: (groepId: string) => void
  onWijziging: () => void
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
        value={waarde}
        onChange={e => setWaarde(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-xs px-2 py-1 border border-everts/40 rounded focus:outline-none focus:ring-1 focus:ring-everts min-w-0"
        onKeyDown={e => e.key === 'Escape' && onAnnuleer()}
      />
      <button type="submit" className="text-xs bg-everts text-white px-2 py-1 rounded hover:bg-everts-dark flex-shrink-0">✓</button>
      <button type="button" onClick={onAnnuleer} className="text-xs text-slate-400 px-1 hover:text-slate-600 flex-shrink-0">✕</button>
    </form>
  )
}

// Niveau-kleur voor de actieve indicator
const NIVEAU_KLEUR = ['bg-everts', 'bg-everts/70', 'bg-everts/40']

export default function StructuurBoom({ scenarioId, actiefGroepId, refreshTrigger, onSelecteer, onWijziging }: Props) {
  const [groepen,      setGroepen]      = useState<Groep[]>([])
  const [ingeklapt,    setIngeklapt]    = useState<Set<string>>(new Set())
  const [toevoegen,    setToevoegen]    = useState<{ parentId: string | null } | null>(null)
  const [nummers,      setNummers]      = useState<Map<string, string>>(new Map())
  const [confirmId,    setConfirmId]    = useState<string | null>(null)

  const laad = useCallback(() => {
    const gs = getGroepen(scenarioId).sort((a, b) => a.volgorde - b.volgorde)
    setGroepen(gs)
    setNummers(berekeningNummers(gs))
  }, [scenarioId, refreshTrigger])

  useEffect(() => { laad() }, [laad])

  const toggle = (id: string) =>
    setIngeklapt(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const scrollNaarGroep = (id: string) => {
    onSelecteer(id)
    setTimeout(() => {
      document.getElementById(`groepkop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const voegGroepToe = (parentId: string | null, naam: string) => {
    const siblings = groepen.filter(g => g.parent_id === parentId)
    const parentGroep = parentId ? groepen.find(g => g.id === parentId) : null
    const niveau = parentGroep ? ((parentGroep.niveau + 1) as 1 | 2 | 3) : 1

    if (niveau > 3) {
      toast.error('Maximale diepte van 3 lagen bereikt')
      return
    }

    const nieuw: Groep = {
      id: nieuweId(),
      scenario_id: scenarioId,
      parent_id: parentId,
      naam,
      niveau,
      volgorde: siblings.length + 1,
    }
    slaGroepOp(nieuw)
    laad()
    onWijziging()
    setToevoegen(null)
    // Direct naar de nieuwe groep scrollen
    setTimeout(() => scrollNaarGroep(nieuw.id), 100)
  }

  const handleVerwijder = (id: string) => {
    verwijderGroep(id)
    laad()
    onWijziging()
    toast.success('Groep verwijderd')
  }

  function renderGroep(groep: Groep, diepte: number): React.ReactNode {
    const kinderen = groepen
      .filter(g => g.parent_id === groep.id)
      .sort((a, b) => a.volgorde - b.volgorde)
    const isOpen    = !ingeklapt.has(groep.id)
    const isActief  = actiefGroepId === groep.id
    const nummer    = nummers.get(groep.id) ?? ''
    const heeftKinderen = kinderen.length > 0

    return (
      <div key={groep.id}>
        {/* Groep rij */}
        <div
          className={cn(
            'flex items-center group rounded-lg mx-1 my-0.5 transition-colors',
            isActief ? 'bg-everts-50' : 'hover:bg-slate-50'
          )}
          style={{ paddingLeft: `${diepte * 12 + 4}px` }}
        >
          {/* Actieve balk */}
          {isActief && (
            <div className={`absolute left-0 w-0.5 h-6 rounded-r ${NIVEAU_KLEUR[diepte] ?? 'bg-everts'}`} />
          )}

          {/* Expand toggle */}
          <button
            onClick={() => toggle(groep.id)}
            className="p-0.5 text-slate-400 hover:text-slate-600 flex-shrink-0 w-5"
          >
            {heeftKinderen
              ? (isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
              : <span className="w-3.5 h-3.5 block" />}
          </button>

          {/* Icoon */}
          {heeftKinderen
            ? (isOpen
                ? <FolderOpen className={`w-3.5 h-3.5 flex-shrink-0 mr-1.5 ${diepte === 0 ? 'text-everts' : 'text-slate-400'}`} />
                : <Folder className={`w-3.5 h-3.5 flex-shrink-0 mr-1.5 ${diepte === 0 ? 'text-everts' : 'text-slate-400'}`} />)
            : <span className="w-3.5 h-3.5 flex-shrink-0 mr-1.5 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </span>
          }

          {/* Naam knop — klik = scroll naar groep in grid */}
          <button
            onClick={() => scrollNaarGroep(groep.id)}
            className={cn(
              'flex-1 text-left py-1.5 min-w-0',
              isActief ? 'text-everts-dark font-semibold' : 'text-slate-700',
              diepte === 0 ? 'text-xs font-semibold' : 'text-xs'
            )}
          >
            <span className="text-slate-400 mr-1 font-mono text-[10px]">{nummer}</span>
            <span className="truncate">{groep.naam}</span>
          </button>

          {/* Hover acties */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 pr-1">
            {groep.niveau < 3 && (
              <button
                onClick={() => setToevoegen({ parentId: groep.id })}
                className="p-1 text-slate-400 hover:text-everts rounded"
                title="Subgroep toevoegen"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => setConfirmId(groep.id)}
              className="p-1 text-slate-300 hover:text-red-500 rounded"
              title="Groep verwijderen"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Inline form voor subgroep toevoegen */}
        {toevoegen?.parentId === groep.id && (
          <div style={{ paddingLeft: `${(diepte + 1) * 12 + 4}px` }}>
            <InlineForm
              placeholder="Naam subgroep..."
              onOpslaan={naam => voegGroepToe(groep.id, naam)}
              onAnnuleer={() => setToevoegen(null)}
            />
          </div>
        )}

        {/* Kinderen (recursief) */}
        {isOpen && kinderen.map(kind => renderGroep(kind, diepte + 1))}
      </div>
    )
  }

  const roots = groepen
    .filter(g => g.parent_id === null)
    .sort((a, b) => a.volgorde - b.volgorde)

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Structuur</span>
        <button
          onClick={() => setToevoegen({ parentId: null })}
          className="p-1 text-slate-400 hover:text-everts hover:bg-everts-50 rounded transition-colors"
          title="Groep toevoegen"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Boom */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Inline form voor root groep */}
        {toevoegen?.parentId === null && (
          <div className="px-2">
            <InlineForm
              placeholder="Naam groep..."
              onOpslaan={naam => voegGroepToe(null, naam)}
              onAnnuleer={() => setToevoegen(null)}
            />
          </div>
        )}

        {roots.map(g => renderGroep(g, 0))}

        {roots.length === 0 && !toevoegen && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400 mb-3">Nog geen groepen aangemaakt</p>
            <button
              onClick={() => setToevoegen({ parentId: null })}
              className="text-xs text-everts hover:underline"
            >
              + Eerste groep toevoegen
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={open => { if (!open) setConfirmId(null) }}
        title="Groep verwijderen?"
        description={`Groep "${groepen.find(g => g.id === confirmId)?.naam ?? ''}" en alle onderliggende regels worden definitief verwijderd.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => { if (confirmId) { handleVerwijder(confirmId); setConfirmId(null) } }}
      />
    </div>
  )
}
