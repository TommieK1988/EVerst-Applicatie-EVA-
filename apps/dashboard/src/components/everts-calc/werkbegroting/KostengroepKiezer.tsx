'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check, X } from 'lucide-react'

export interface KostengroepOptie {
  value: string
  label: string | null
}

interface Props {
  waarde?: string | null
  opties: KostengroepOptie[]
  onKies: (waarde: string | undefined) => void
  /** Read-only weergave (regel is besteld in Bouw7). */
  vergrendeld?: boolean
  /** Vrije tekst toestaan (EVA-origine). Bij Bouw7-codes staat alleen de lijst toe. */
  vrijeTekst?: boolean
  /** Titel/tooltip op de knop. */
  title?: string
}

/**
 * Kostengroep-picker voor de werkbegroting.
 *
 * Bewust géén `<input list=…>` met datalist: een datalist filtert op de huidige
 * waarde, dus zodra een regel een kostengroep hééft toont de browser alleen díe
 * ene optie — precies de groep waar de regel al in staat. Deze kiezer opent
 * altijd de volledige lijst en filtert pas als je zelf zoekt.
 *
 * De lijst hangt in een portal met `position: fixed`, zodat hij niet wordt
 * afgekapt door de scroll-container van de tabel.
 */
export default function KostengroepKiezer({
  waarde, opties, onKies, vergrendeld, vrijeTekst, title,
}: Props) {
  const [open,   setOpen]   = useState(false)
  const [zoek,   setZoek]   = useState('')
  const [actief, setActief] = useState(0)
  const [pos,    setPos]    = useState<{ top: number; left: number; width: number } | null>(null)

  const knopRef = useRef<HTMLButtonElement>(null)
  const lijstRef = useRef<HTMLDivElement>(null)

  const herpositioneer = useCallback(() => {
    const el = knopRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const breedte = Math.max(r.width, 260)
    setPos({
      top:   r.bottom + 2,
      left:  Math.min(r.left, window.innerWidth - breedte - 8),
      width: breedte,
    })
  }, [])

  // Openen/sluiten
  useEffect(() => {
    if (!open) return
    herpositioneer()
    const opBuiten = (e: MouseEvent) => {
      const t = e.target as Node
      if (knopRef.current?.contains(t) || lijstRef.current?.contains(t)) return
      setOpen(false)
    }
    const opScroll = (e: Event) => {
      if (lijstRef.current?.contains(e.target as Node)) return
      herpositioneer()
    }
    document.addEventListener('mousedown', opBuiten)
    window.addEventListener('scroll', opScroll, true)
    window.addEventListener('resize', herpositioneer)
    return () => {
      document.removeEventListener('mousedown', opBuiten)
      window.removeEventListener('scroll', opScroll, true)
      window.removeEventListener('resize', herpositioneer)
    }
  }, [open, herpositioneer])

  const gefilterd = useMemo(() => {
    const t = zoek.trim().toLowerCase()
    if (!t) return opties
    return opties.filter(o =>
      o.value.toLowerCase().includes(t) || (o.label ?? '').toLowerCase().includes(t))
  }, [opties, zoek])

  // Nieuwe (nog niet bestaande) kostengroep — alleen bij vrije tekst
  const nieuweWaarde = useMemo(() => {
    const t = zoek.trim()
    if (!vrijeTekst || !t) return null
    return opties.some(o => o.value.toLowerCase() === t.toLowerCase()) ? null : t
  }, [vrijeTekst, zoek, opties])

  const kies = (v: string | undefined) => {
    onKies(v)
    setOpen(false)
    setZoek('')
  }

  const opToets = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')   { e.preventDefault(); setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActief(i => Math.min(i + 1, gefilterd.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActief(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (gefilterd[actief]) kies(gefilterd[actief].value)
      else if (nieuweWaarde)  kies(nieuweWaarde)
    }
  }

  const toonWaarde = (waarde ?? '').trim()

  if (vergrendeld) {
    return (
      <span className="block w-full text-xs px-1 py-0.5 text-slate-400 truncate" title={title}>
        {toonWaarde || '—'}
      </span>
    )
  }

  return (
    <>
      <button
        ref={knopRef}
        type="button"
        title={title ?? toonWaarde}
        onClick={() => { setOpen(v => !v); setZoek(''); setActief(0) }}
        className="group/kg w-full min-w-0 flex items-center gap-1 text-xs px-1 py-0.5 rounded border border-transparent
          text-left text-slate-600 hover:border-slate-200 hover:bg-white
          focus:border-everts focus:bg-white focus:outline-none"
      >
        <span className={`flex-1 min-w-0 truncate ${toonWaarde ? '' : 'text-slate-300'}`}>
          {toonWaarde || '—'}
        </span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 text-slate-300 group-hover/kg:text-slate-500" />
      </button>

      {open && pos && createPortal(
        <div
          ref={lijstRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[100] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
            <Search className="w-3 h-3 text-slate-300 flex-shrink-0" />
            <input
              autoFocus
              value={zoek}
              onChange={e => { setZoek(e.target.value); setActief(0) }}
              onKeyDown={opToets}
              placeholder={vrijeTekst ? 'Zoeken of nieuwe naam…' : 'Zoek bewakingscode…'}
              className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none placeholder:text-slate-300"
            />
            {zoek && (
              <button type="button" onClick={() => setZoek('')} className="text-slate-300 hover:text-slate-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => kies(undefined)}
              className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
            >
              <span className="w-3 flex-shrink-0" />
              Geen kostengroep
            </button>

            {gefilterd.map((o, i) => {
              const gekozen = o.value === toonWaarde
              return (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setActief(i)}
                  onClick={() => kies(o.value)}
                  className={[
                    'w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs',
                    i === actief ? 'bg-everts-50' : '',
                    gekozen ? 'font-semibold text-everts' : 'text-slate-700',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="w-3 flex-shrink-0">
                    {gekozen && <Check className="w-3 h-3" />}
                  </span>
                  <span className="truncate">{o.value}</span>
                </button>
              )
            })}

            {gefilterd.length === 0 && !nieuweWaarde && (
              <p className="px-2.5 py-2 text-xs text-slate-400">Geen kostengroep gevonden</p>
            )}

            {nieuweWaarde && (
              <button
                type="button"
                onClick={() => kies(nieuweWaarde)}
                className="w-full text-left px-2.5 py-1.5 text-xs text-everts hover:bg-everts-50 border-t border-slate-100"
              >
                Nieuw: <span className="font-semibold">{nieuweWaarde}</span>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
