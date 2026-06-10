'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import type { Meetregel } from '@/lib/everts-calc/types'
import { berekenHoeveelheid, isRegelActief } from '@/lib/everts-calc/meetstaat-utils'

interface SchilderData {
  onderdelen: { id: string; naam: string; code: string | null }[]
  types: { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[]
  behandelingen: { id: string; naam: string; code: string | null }[]
  combinaties: { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[]
}

interface Props {
  regel: Meetregel
  volgnummer: number
  isActief: boolean
  onFocus: () => void
  onWijzig: (patch: Partial<Meetregel>) => void
  onEnter: () => void
  onVerwijder: () => void
  schilderData?: SchilderData
}

// ─── ZOEKINVOER ──────────────────────────────────────────────────────────────
// Lichtgewicht combobox die native <datalist> vervangt. Gebruikt position:fixed
// dropdown zodat het ook binnen overflow:auto containers werkt. Auto-selecteert
// bij exacte code-match; één onSelect-callback → geen dubbele onWijzig-calls.

interface ZoekOptie { id: string; naam: string; code?: string | null }

function ZoekInvoer({
  value, opties, placeholder, inputRef: externalRef, onSelect, onEnter, onFocus: onFocusProp,
}: {
  value: string | undefined
  opties: ZoekOptie[]
  placeholder?: string
  inputRef?: React.RefObject<HTMLInputElement>
  onSelect: (id: string | undefined, naam: string | undefined) => void
  onEnter: () => void
  onFocus: () => void
}) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = externalRef ?? localRef
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState(value ?? '')
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // Sync inputVal wanneer value extern wijzigt (bijv. carry-over behandeling)
  useEffect(() => { setInputVal(value ?? '') }, [value])

  // Filterlijst op code of naam
  const q = inputVal.toLowerCase()
  const gefilterd = q === ''
    ? opties
    : opties.filter(o =>
        o.naam.toLowerCase().includes(q) ||
        (o.code?.toLowerCase().includes(q) ?? false)
      )

  const selecteer = useCallback((o: ZoekOptie) => {
    setInputVal(o.naam)
    setOpen(false)
    onSelect(o.id, o.naam)
  }, [onSelect])

  const handleInput = (val: string) => {
    setInputVal(val)

    if (!val.trim()) {
      setOpen(false)
      onSelect(undefined, undefined)
      return
    }

    // Auto-selectie bij exacte code-match (typt "001" → selecteert direct)
    const opCode = opties.find(o => o.code?.toLowerCase() === val.toLowerCase())
    if (opCode) { selecteer(opCode); return }

    // Auto-selectie bij exacte naam-match
    const opNaam = opties.find(o => o.naam.toLowerCase() === val.toLowerCase())
    if (opNaam) { selecteer(opNaam); return }

    setOpen(true)
  }

  const openDropdown = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 1, left: r.left, width: Math.max(r.width, 200) })
    }
    setOpen(true)
  }

  // Sluit bij klik buiten dropdown
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, ref])

  // Sluit bij scrollen (anders raakt dropdown positie kwijt)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  return (
    <>
      <input
        ref={ref}
        type="text"
        value={inputVal}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { onFocusProp(); openDropdown(); setTimeout(() => ref.current?.select(), 0) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); e.stopPropagation() }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (gefilterd.length === 1) selecteer(gefilterd[0])
            else { setOpen(false); onEnter() }
          }
        }}
        className="w-full text-xs px-1.5 py-0.5 rounded bg-transparent border-0
          hover:bg-white hover:border hover:border-slate-200
          focus:bg-white focus:border focus:border-everts/40 focus:outline-none
          placeholder-slate-300 text-slate-700"
      />
      {open && gefilterd.length > 0 && dropPos && (
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: dropPos.width, zIndex: 9999 }}
          className="max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl"
        >
          {gefilterd.slice(0, 25).map(o => (
            <div
              key={o.id}
              onMouseDown={e => { e.preventDefault(); selecteer(o) }}
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-everts/5 text-xs"
            >
              {o.code && (
                <span className="flex-shrink-0 font-mono font-semibold text-[10px] px-1.5 py-0.5 rounded bg-everts/10 text-everts min-w-[2rem] text-center">
                  {o.code}
                </span>
              )}
              <span className="text-slate-700">{o.naam}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── MEETREGEL RIJ ────────────────────────────────────────────────────────────

export default function MeetregelRij({
  regel, volgnummer, isActief, onFocus, onWijzig, onEnter, onVerwijder, schilderData,
}: Props) {
  const eersteRef = useRef<HTMLInputElement>(null)
  const actief = isRegelActief(regel)
  const hoev = berekenHoeveelheid(regel)

  const geselecteerdOnderdeel = schilderData?.onderdelen.find(o => o.id === regel.onderdeel_id)
  const geselecteerdType = schilderData?.types.find(t => t.id === regel.type_id)

  useEffect(() => {
    if (isActief && regel.is_leeg && eersteRef.current) eersteRef.current.focus()
  }, [isActief, regel.is_leeg])

  const beschikbareTypes = schilderData
    ? regel.onderdeel_id
      ? schilderData.types.filter(t => t.onderdeel_id === regel.onderdeel_id)
      : []
    : []

  const beschikbareBehandelingen = schilderData
    ? (() => {
        if (!regel.type_id) return []
        const combIds = schilderData.combinaties
          .filter(c => c.type_id === regel.type_id)
          .map(c => c.behandeling_id)
        return schilderData.behandelingen.filter(b => combIds.includes(b.id))
      })()
    : []

  const ni = (value: number | undefined, onChange: (v: number | undefined) => void, placeholder = '', cls = '') => (
    <input
      type="number" step="0.01" min="0"
      value={value === undefined || value === 0 ? '' : value}
      placeholder={placeholder}
      onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); onChange(isNaN(v as number) ? undefined : v) }}
      onFocus={onFocus}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      className={`w-full text-xs text-right font-mono px-1 py-0.5 rounded bg-transparent border-0
        hover:bg-white hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none ${cls}`}
    />
  )

  const ti = (value: string | undefined, onChange: (v: string) => void, placeholder = '', ref?: React.RefObject<HTMLInputElement>) => (
    <input
      ref={ref} type="text" value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      className="w-full text-xs px-1.5 py-0.5 rounded bg-transparent border-0
        hover:bg-white hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none
        placeholder-slate-300 text-slate-700"
    />
  )

  const rijCls = `border-b border-slate-100 transition-colors ${
    isActief ? 'bg-everts/5' : actief ? 'bg-white hover:bg-slate-50' : 'bg-white/60 hover:bg-white'
  }`

  return (
    <tr className={rijCls} onClick={onFocus}>
      {/* # */}
      <td className="px-2 py-1 text-center">
        <span className={`text-xs font-mono ${actief ? 'text-slate-400' : 'text-slate-200'}`}>
          {actief ? volgnummer : ''}
        </span>
      </td>

      {/* Onderdeel */}
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-0.5">
          {geselecteerdOnderdeel?.code && (
            <span className="flex-shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-everts/10 text-everts">
              {geselecteerdOnderdeel.code}
            </span>
          )}
          {schilderData && schilderData.onderdelen.length > 0
            ? <ZoekInvoer
                value={regel.onderdeel}
                opties={schilderData.onderdelen}
                placeholder="Onderdeel..."
                inputRef={eersteRef}
                onFocus={onFocus}
                onEnter={onEnter}
                onSelect={(id, naam) => {
                  if (id !== undefined && id === regel.onderdeel_id) return
                  onWijzig({ onderdeel: naam ?? '', onderdeel_id: id, type_id: undefined, type: undefined, behandeling_id: undefined, behandeling: undefined })
                }}
              />
            : ti(regel.onderdeel, v => onWijzig({ onderdeel: v }), 'Onderdeel...', eersteRef)
          }
        </div>
      </td>

      {/* Type */}
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-0.5">
          {geselecteerdType?.code && (
            <span className="flex-shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {geselecteerdType.code}
            </span>
          )}
          {schilderData && regel.onderdeel_id
            ? <ZoekInvoer
                value={regel.type}
                opties={beschikbareTypes}
                placeholder="Type..."
                onFocus={onFocus}
                onEnter={onEnter}
                onSelect={(id, naam) => {
                  const t = id ? beschikbareTypes.find(tt => tt.id === id) : undefined
                  onWijzig({
                    type: naam ?? '', type_id: id,
                    behandeling_id: undefined, behandeling: undefined,
                    ...(t ? { eenheid: t.eenheid, formule: t.formule ?? undefined } : {}),
                  })
                }}
              />
            : <span className="text-[11px] text-slate-300 px-1.5 italic">kies eerst onderdeel</span>
          }
        </div>
      </td>

      {/* Behandeling */}
      <td className="px-1 py-0.5">
        {schilderData && beschikbareBehandelingen.length > 0
          ? <ZoekInvoer
              value={regel.behandeling}
              opties={beschikbareBehandelingen}
              placeholder="Behandeling..."
              onFocus={onFocus}
              onEnter={onEnter}
              onSelect={(id, naam) => onWijzig({ behandeling: naam ?? '', behandeling_id: id })}
            />
          : ti(regel.behandeling, v => onWijzig({ behandeling: v }), 'Behandeling...')
        }
      </td>

      {/* B */}
      <td className="px-0.5 py-0.5 bg-blue-50/30">
        {ni(regel.breedte, v => onWijzig({ breedte: v }), '—', 'text-blue-700')}
      </td>

      {/* H */}
      <td className="px-0.5 py-0.5 bg-blue-50/30">
        {ni(regel.hoogte, v => onWijzig({ hoogte: v }), '—', 'text-blue-700')}
      </td>

      {/* L */}
      <td className="px-0.5 py-0.5 bg-blue-50/20">
        {ni(regel.lengte, v => onWijzig({ lengte: v }), '—', 'text-blue-600')}
      </td>

      {/* Aantal */}
      <td className="px-0.5 py-0.5">
        {ni(regel.aantal === 1 && !regel.breedte && !regel.lengte ? undefined : regel.aantal, v => onWijzig({ aantal: v ?? 1 }), '1')}
      </td>

      {/* Hoeveelheid */}
      <td className="px-2 py-0.5 text-right">
        {hoev > 0 ? (
          <span className={`text-xs font-mono font-semibold ${actief ? 'text-everts' : 'text-slate-300'}`}>
            {hoev.toFixed(2)}
          </span>
        ) : null}
      </td>

      {/* Eenheid — read-only */}
      <td className="px-1 py-0.5 text-center">
        <span className="text-xs font-mono text-slate-400">{regel.eenheid}</span>
      </td>

      {/* Omschrijving */}
      <td className="px-1 py-0.5">
        {ti(regel.omschrijving, v => onWijzig({ omschrijving: v }), 'Toelichting...')}
      </td>

      {/* Verwijder */}
      <td className="px-1 py-0.5 text-center">
        {!regel.is_leeg && (
          <button
            onClick={e => { e.stopPropagation(); onVerwijder() }}
            className="p-0.5 text-slate-200 hover:text-red-400 rounded transition-colors"
            title="Verwijder regel"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </td>
    </tr>
  )
}
