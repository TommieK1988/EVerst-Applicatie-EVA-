'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, FolderOpen, Folder, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn, nieuweId } from '@/lib/everts-calc/utils'
import { getGroepen, slaGroepOp, verwijderGroep } from '@/lib/everts-calc/local-store'
import { berekeningNummers } from '@/lib/everts-calc/calculations'
import {
  platteGroepen, verplaatsGroep, magVerplaatsenNaar, positieVoor, positieIn, subtreeIds,
  type Doelpositie,
} from '@/lib/everts-calc/groep-boom'
import type { Groep } from '@/lib/everts-calc/types'
import ConfirmDialog from '@/components/everts-calc/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  scenarioId: string
  actiefGroepId: string | null
  refreshTrigger: number
  onSelecteer: (groepId: string) => void
  onWijziging: () => void
  /** Aangeroepen vlak vóór een verplaatsing, zodat Ctrl+Z in het rekenblad hem terugdraait. */
  onVoorWijziging?: () => void
  /** Bevroren calculatie: structuur is te bekijken, niet te wijzigen. */
  readOnly?: boolean
}

interface InlineFormProps {
  placeholder: string
  onOpslaan: (naam: string) => void
  onAnnuleer: () => void
}

/** Inspringing per niveau (px). Ruim genoeg om de nesting in één oogopslag te zien. */
const INSPRING = 16
/** Hoogte van een invoegstrook tijdens het slepen — bewust royaal, dit is een mikpunt. */
const STROOK_HOOGTE = 16
const AUTOSCROLL_ZONE = 48
const AUTOSCROLL_STAP = 12

/**
 * Waar de gesleepte groep landt als je nú loslaat.
 *
 * Twee soorten doelen, allebei een eigen vlak in plaats van een bandje binnen een rij:
 *  - `strook` — de ruimte tússen twee rijen: ervóór, op het niveau van de rij eronder;
 *  - `rij`    — de rij zelf: erín, als laatste subgroep.
 *
 * Samen dekken ze elke positie in de boom, zonder dat je zijwaarts hoeft te mikken.
 */
interface Doel {
  soort: 'strook' | 'rij'
  /** Identificeert het actieve vlak: `strook-<index>` of `rij-<id>`. */
  sleutel: string
  positie: Doelpositie
  geldig: boolean
  /** Regel voor de statusstrook, bijv. `vóór "Afplakken" · niveau 2`. */
  omschrijving: string
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
      <Button type="submit" variant="primary" size="sm" className="flex-shrink-0">✓</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onAnnuleer} className="flex-shrink-0">✕</Button>
    </form>
  )
}

/**
 * Compacte badge als sleepbeeld, náást de cursor. Het standaard sleepbeeld is een
 * screenshot van de hele rij die precies over de indicator en zijn label heen valt.
 */
function zetSleepBadge(e: React.DragEvent, tekst: string) {
  const badge = document.createElement('div')
  badge.textContent = tekst
  Object.assign(badge.style, {
    position: 'fixed', top: '-1000px', left: '0',
    padding: '3px 8px', borderRadius: '6px',
    background: '#013a20', color: '#fff',
    font: '600 11px/1.4 system-ui, sans-serif', whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,.3)',
  })
  document.body.appendChild(badge)
  // Negatieve offset: de badge hangt rechtsonder náást de cursor, niet eronder.
  e.dataTransfer.setDragImage(badge, -14, -6)
  setTimeout(() => badge.remove(), 0)
}

// Niveau-kleur voor de actieve indicator
const NIVEAU_KLEUR = ['bg-everts', 'bg-everts/70', 'bg-everts/40']

export default function StructuurBoom({
  scenarioId, actiefGroepId, refreshTrigger, onSelecteer, onWijziging,
  onVoorWijziging, readOnly = false,
}: Props) {
  const [groepen,   setGroepen]   = useState<Groep[]>([])
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set())
  const [toevoegen, setToevoegen] = useState<{ parentId: string | null } | null>(null)
  const [nummers,   setNummers]   = useState<Map<string, string>>(new Map())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [sleepId,   setSleepId]   = useState<string | null>(null)
  const [doel,      setDoel]      = useState<Doel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  /* ── Zichtbare rijen ──────────────────────────────────────────────────────
     Ingeklapte takken doen niet mee: je kunt alleen mikken op wat je ziet. */
  const zichtbaar = useMemo(() => {
    const verborgen = new Set<string>()
    return platteGroepen(groepen).filter(p => {
      const ouder = p.groep.parent_id
      if (ouder && (verborgen.has(ouder) || ingeklapt.has(ouder))) {
        verborgen.add(p.groep.id)
        return false
      }
      return true
    })
  }, [groepen, ingeklapt])

  /** Rijen die met de gesleepte groep meeverhuizen — geen doel, en zichtbaar gedimd. */
  const eigenTak = useMemo(
    () => (sleepId ? subtreeIds(groepen, sleepId) : new Set<string>()),
    [groepen, sleepId],
  )

  /* ── Slepen ───────────────────────────────────────────────────────────────── */
  const autoScroll = useCallback((clientY: number) => {
    const c = scrollRef.current
    if (!c) return
    const r = c.getBoundingClientRect()
    if      (clientY < r.top + AUTOSCROLL_ZONE)    c.scrollTop -= AUTOSCROLL_STAP
    else if (clientY > r.bottom - AUTOSCROLL_ZONE) c.scrollTop += AUTOSCROLL_STAP
  }, [])

  const resetSleep = useCallback(() => { setSleepId(null); setDoel(null) }, [])

  const handleDragStart = (e: React.DragEvent, groep: Groep) => {
    if (readOnly) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', groep.id)
    setSleepId(groep.id)
    setDoel(null)
    zetSleepBadge(e, `${nummers.get(groep.id) ?? ''} ${groep.naam}`.trim())
  }

  /** Bouwt het doel voor een vlak en bepaalt meteen of het mag. */
  const maakDoel = useCallback((
    soort: Doel['soort'],
    sleutel: string,
    positie: Doelpositie | null,
    label: string,
  ): Doel | null => {
    if (!sleepId || !positie) return null
    const geldig = magVerplaatsenNaar(groepen, sleepId, positie.parentId)
    const reden = positie.parentId && subtreeIds(groepen, sleepId).has(positie.parentId)
      ? 'kan niet binnen zichzelf'
      : 'past niet — maximaal 3 niveaus'
    return {
      soort, sleutel, positie, geldig,
      omschrijving: geldig ? `${label} · niveau ${positie.diepte + 1}` : reden,
    }
  }, [sleepId, groepen])

  /**
   * Ongeldige doelen krijgen bewust géén `preventDefault()`: de browser toont dan zelf
   * een verbodscursor en weigert de drop, terwijl de statusstrook de reden noemt.
   */
  const richtOp = (e: React.DragEvent, nieuwDoel: Doel | null) => {
    if (!sleepId) return
    autoScroll(e.clientY)
    setDoel(nieuwDoel)
    if (nieuwDoel?.geldig) e.preventDefault()
  }

  const strookOver = (e: React.DragEvent, index: number) => {
    const onder = zichtbaar[index]
    richtOp(e, onder
      ? maakDoel('strook', `strook-${index}`, positieVoor(groepen, onder.groep.id), `vóór "${onder.groep.naam}"`)
      : maakDoel('strook', `strook-${index}`, positieIn(groepen, null), 'onderaan als hoofdgroep'))
  }

  const rijOver = (e: React.DragEvent, groep: Groep) => {
    if (eigenTak.has(groep.id)) { richtOp(e, null); return }
    richtOp(e, maakDoel('rij', `rij-${groep.id}`, positieIn(groepen, groep.id), `in "${groep.naam}", als laatste`))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!sleepId || !doel?.geldig) { resetSleep(); return }
    const sleep = groepen.find(g => g.id === sleepId)
    const gewijzigd = verplaatsGroep(groepen, sleepId, doel.positie.parentId, doel.positie.voorGroepId)
    if (gewijzigd.length === 0) { resetSleep(); return }

    onVoorWijziging?.()
    gewijzigd.forEach(g => slaGroepOp(g))
    // Nieuwe ouder openklappen, anders verdwijnt de groep uit beeld.
    if (doel.positie.parentId) {
      const ouderId = doel.positie.parentId
      setIngeklapt(prev => {
        const next = new Set(prev)
        next.delete(ouderId)
        return next
      })
    }
    laad()
    onWijziging()
    resetSleep()
    toast.success(`"${sleep?.naam ?? 'Groep'}" ${doel.omschrijving.replace(/ · niveau \d+$/, '')}`)
  }

  const roots = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)
  const magSlepen = !readOnly && groepen.length > 1

  /** Invoegstrook tussen twee rijen. Alleen tijdens het slepen, want dan is het een mikpunt. */
  const renderStrook = (index: number) => {
    if (!sleepId) return null
    const actief = doel?.sleutel === `strook-${index}`
    const onder  = zichtbaar[index]
    const inspring = 8 + (onder ? onder.diepte : 0) * INSPRING
    return (
      <div
        onDragOver={e => strookOver(e, index)}
        onDrop={handleDrop}
        className="flex items-center"
        style={{ height: STROOK_HOOGTE, paddingLeft: inspring, paddingRight: 8 }}
      >
        {actief && doel?.geldig
          ? (
            <>
              <span className="w-0.5 h-3 rounded-sm bg-everts flex-shrink-0" />
              <span className="flex-1 h-0.5 rounded bg-everts" />
            </>
          )
          : <span className={cn('flex-1 h-px rounded', actief ? 'bg-red-300' : 'bg-slate-200')} />}
      </div>
    )
  }

  function renderRij({ groep, diepte }: { groep: Groep; diepte: number }) {
    const isOpen    = !ingeklapt.has(groep.id)
    const isActief  = actiefGroepId === groep.id
    const nummer    = nummers.get(groep.id) ?? ''
    const heeftKinderen = groepen.some(g => g.parent_id === groep.id)
    const isDropDoel = doel?.sleutel === `rij-${groep.id}`
    const gaatMee    = sleepId !== null && eigenTak.has(groep.id)

    return (
      <div
        draggable={magSlepen}
        onDragStart={e => handleDragStart(e, groep)}
        onDragEnd={resetSleep}
        onDragOver={e => rijOver(e, groep)}
        onDrop={handleDrop}
        className={cn(
          'flex items-center group rounded-lg mx-1 my-0.5 transition-colors',
          magSlepen && 'cursor-grab active:cursor-grabbing',
          gaatMee && 'opacity-40',
          isDropDoel && doel?.geldig && 'ring-2 ring-everts bg-everts-50',
          isDropDoel && !doel?.geldig && 'ring-2 ring-red-300',
          !isDropDoel && (isActief ? 'bg-everts-50' : 'hover:bg-slate-50'),
        )}
        style={{ paddingLeft: `${diepte * INSPRING + 4}px` }}
      >
        {/* Actieve balk */}
        {isActief && (
          <div className={`absolute left-0 w-0.5 h-6 rounded-r ${NIVEAU_KLEUR[diepte] ?? 'bg-everts'}`} />
        )}

        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => toggle(groep.id)}
          className="flex-shrink-0 w-5 h-5 p-0 text-slate-400 hover:text-slate-600"
        >
          {heeftKinderen
            ? (isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
            : <span className="w-3.5 h-3.5 block" />}
        </Button>

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
            'flex-1 text-left py-2 min-w-0 flex items-baseline gap-1',
            isActief ? 'text-everts-dark font-semibold' : 'text-slate-700',
            diepte === 0 ? 'text-xs font-semibold' : 'text-xs',
          )}
        >
          <span className="text-slate-400 text-[10px] flex-shrink-0">{nummer}</span>
          <span className="truncate">{groep.naam}</span>
        </button>

        {/* Hover acties */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 pr-1">
          {magSlepen && <GripVertical className="w-3 h-3 text-slate-300" />}
          {!readOnly && groep.niveau < 3 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setToevoegen({ parentId: groep.id })}
              title="Subgroep toevoegen"
              className="text-slate-400 hover:text-everts"
            >
              <Plus className="w-3 h-3" />
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmId(groep.id)}
              title="Groep verwijderen"
              className="text-slate-300 hover:text-red-500"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Structuur</span>
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setToevoegen({ parentId: null })}
            title="Groep toevoegen"
            className="text-slate-400 hover:text-everts hover:bg-everts-50"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Statusstrook: staat altijd op dezelfde plek, dus nooit onder je cursor of
          onder de groep die je sleept. */}
      {sleepId && (
        <div
          className={cn(
            'px-3 py-1.5 text-[11px] border-b flex-shrink-0 truncate',
            doel?.geldig
              ? 'bg-everts-50 border-everts/20 text-everts-dark'
              : 'bg-slate-50 border-slate-200 text-slate-500',
          )}
        >
          {doel
            ? <>{doel.geldig ? '→ ' : '× '}{doel.omschrijving}</>
            : 'Sleep naar een strook om ertussen te zetten, of op een groep om erin te zetten'}
        </div>
      )}

      {/* Boom */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
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

        {zichtbaar.map((rij, i) => (
          <Fragment key={rij.groep.id}>
            {renderStrook(i)}
            {renderRij(rij)}
            {toevoegen?.parentId === rij.groep.id && (
              <div style={{ paddingLeft: `${(rij.diepte + 1) * INSPRING + 4}px` }}>
                <InlineForm
                  placeholder="Naam subgroep..."
                  onOpslaan={naam => voegGroepToe(rij.groep.id, naam)}
                  onAnnuleer={() => setToevoegen(null)}
                />
              </div>
            )}
          </Fragment>
        ))}
        {renderStrook(zichtbaar.length)}

        {roots.length === 0 && !toevoegen && (
          <EmptyState
            size="sm"
            tone="neutral"
            title="Nog geen groepen"
            description="Voeg een eerste groep toe om de structuur op te bouwen."
            actions={!readOnly ? (
              <Button variant="outline" size="sm" onClick={() => setToevoegen({ parentId: null })}>
                <Plus className="w-3.5 h-3.5" />
                Eerste groep toevoegen
              </Button>
            ) : undefined}
          />
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
