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
  /** Positie in het rekenblad; samen met de kolom het adres voor de pijltoetsen. */
  rijIndex: number
  isActief: boolean
  /** Zet de cursor in deze rij. Alleen waar op het moment dat het rekenblad de
   *  focus verplaatst (groep openen, Enter) — niet zomaar omdat de rij actief is,
   *  anders trekt deze rij de cursor weg uit de cel die je net aanklikte of waar
   *  je met een pijltoets naartoe ging. */
  moetFocussen: boolean
  onGefocust: () => void
  isGeselecteerd: boolean
  onSelecteer: (aan: boolean) => void
  onFocus: () => void
  onWijzig: (patch: Partial<Meetregel>) => void
  onEnter: () => void
  onVerwijder: () => void
  schilderData?: SchilderData
}

// ─── KOLOMADRESSEN ───────────────────────────────────────────────────────────
// Alleen de bewerkbare cellen tellen mee; #, vinkje, hoeveelheid, eenheid en de
// prullenbak zijn geen navigatiedoel. MeetregelGrid gebruikt dezelfde nummering.

export const KOL = {
  element: 0, onderdeel: 1, type: 2, behandeling: 3,
  breedte: 4, hoogte: 5, breedteAantal: 6, hoogteAantal: 7,
  factor: 8, aantal: 9, opmerking: 10,
} as const

export const LAATSTE_KOL = KOL.opmerking

// ─── ZOEKINVOER ──────────────────────────────────────────────────────────────
// Lichtgewicht combobox die native <datalist> vervangt. Gebruikt position:fixed
// dropdown zodat het ook binnen overflow:auto containers werkt. Auto-selecteert
// bij exacte code-match; één onSelect-callback → geen dubbele onWijzig-calls.

interface ZoekOptie { id: string; naam: string; code?: string | null }

function ZoekInvoer({
  value, opties, placeholder, inputRef: externalRef, celAdres, onSelect, onEnter, onFocus: onFocusProp,
}: {
  value: string | undefined
  opties: ZoekOptie[]
  placeholder?: string
  inputRef?: React.RefObject<HTMLInputElement>
  celAdres: string
  onSelect: (id: string | undefined, naam: string | undefined) => void
  onEnter: () => void
  onFocus: () => void
}) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = externalRef ?? localRef
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState(value ?? '')
  const [gemarkeerd, setGemarkeerd] = useState(0)
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

  // De lijst claimt de pijltoetsen alleen als de gebruiker aan het zoeken is. Staat
  // hij alleen open omdat je de cel binnenkwam, dan horen omhoog/omlaag bij het
  // rekenblad — anders zou je in deze drie kolommen nooit van rij kunnen wisselen.
  const lijstActief = open && inputVal.trim() !== '' && gefilterd.length > 0

  const selecteer = useCallback((o: ZoekOptie) => {
    setInputVal(o.naam)
    setOpen(false)
    onSelect(o.id, o.naam)
  }, [onSelect])

  const handleInput = (val: string) => {
    setInputVal(val)
    setGemarkeerd(0)

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
    setGemarkeerd(0)
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
        data-cel={celAdres}
        value={inputVal}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { onFocusProp(); openDropdown(); setTimeout(() => ref.current?.select(), 0) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); e.stopPropagation() }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!lijstActief) { setOpen(false); return }   // laat het rekenblad navigeren
            e.preventDefault()
            e.stopPropagation()
            setGemarkeerd(i =>
              e.key === 'ArrowDown'
                ? Math.min(i + 1, gefilterd.length - 1)
                : Math.max(i - 1, 0)
            )
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (lijstActief) selecteer(gefilterd[Math.min(gemarkeerd, gefilterd.length - 1)])
            else if (gefilterd.length === 1) selecteer(gefilterd[0])
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
          {gefilterd.slice(0, 25).map((o, i) => (
            <div
              key={o.id}
              onMouseDown={e => { e.preventDefault(); selecteer(o) }}
              className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs ${
                lijstActief && i === gemarkeerd ? 'bg-everts/10' : 'hover:bg-everts/5'
              }`}
            >
              {o.code && (
                <span className="flex-shrink-0  font-semibold text-[10px] px-1.5 py-0.5 rounded bg-everts/10 text-everts min-w-[2rem] text-center">
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
  regel, volgnummer, rijIndex, isActief, moetFocussen, onGefocust, isGeselecteerd, onSelecteer,
  onFocus, onWijzig, onEnter, onVerwijder, schilderData,
}: Props) {
  const eersteRef = useRef<HTMLInputElement>(null)
  const actief = isRegelActief(regel)
  const hoev = berekenHoeveelheid(regel)

  const geselecteerdOnderdeel = schilderData?.onderdelen.find(o => o.id === regel.onderdeel_id)
  const geselecteerdType = schilderData?.types.find(t => t.id === regel.type_id)

  const cel = (kol: number) => `${rijIndex}:${kol}`

  useEffect(() => {
    if (!moetFocussen || !eersteRef.current) return
    eersteRef.current.focus()
    onGefocust()
  }, [moetFocussen, onGefocust])

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

  const ni = (kol: number, value: number | undefined, onChange: (v: number | undefined) => void, placeholder = '', cls = '') => (
    <input
      type="number" step="0.01" min="0"
      data-cel={cel(kol)}
      value={value === undefined || value === 0 ? '' : value}
      placeholder={placeholder}
      onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); onChange(isNaN(v as number) ? undefined : v) }}
      onFocus={onFocus}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      className={`w-full text-xs text-right  px-1 py-0.5 rounded bg-transparent border-0
        hover:bg-white hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none ${cls}`}
    />
  )

  const ti = (kol: number, value: string | undefined, onChange: (v: string) => void, placeholder = '', ref?: React.RefObject<HTMLInputElement>) => (
    <input
      ref={ref} type="text" data-cel={cel(kol)} value={value ?? ''} placeholder={placeholder}
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
    isGeselecteerd ? 'bg-everts/10' : isActief ? 'bg-everts/5' : actief ? 'bg-white hover:bg-slate-50' : 'bg-paper/60 hover:bg-white'
  }`

  return (
    <tr className={rijCls} onClick={onFocus}>
      {/* Selectievinkje — alleen op bestaande regels */}
      <td className="px-1 py-1 text-center">
        {!regel.is_leeg && (
          <input
            type="checkbox"
            checked={isGeselecteerd}
            onChange={e => onSelecteer(e.target.checked)}
            onClick={e => e.stopPropagation()}
            title="Selecteer voor 'Element opslaan'"
            className="w-3.5 h-3.5 rounded border-slate-300 text-everts focus:ring-everts/40 cursor-pointer"
          />
        )}
      </td>

      {/* # */}
      <td className="px-2 py-1 text-center">
        <span className={`text-xs  ${actief ? 'text-slate-400' : 'text-slate-200'}`}>
          {actief ? volgnummer : ''}
        </span>
      </td>

      {/* Element */}
      <td className="px-1 py-0.5">
        {ti(KOL.element, regel.element, v => onWijzig({ element: v }), 'Element...')}
      </td>

      {/* Onderdeel */}
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-0.5">
          {geselecteerdOnderdeel?.code && (
            <span className="flex-shrink-0 text-[10px]  font-semibold px-1.5 py-0.5 rounded bg-everts/10 text-everts">
              {geselecteerdOnderdeel.code}
            </span>
          )}
          {schilderData && schilderData.onderdelen.length > 0
            ? <ZoekInvoer
                value={regel.onderdeel}
                opties={schilderData.onderdelen}
                placeholder="Onderdeel..."
                inputRef={eersteRef}
                celAdres={cel(KOL.onderdeel)}
                onFocus={onFocus}
                onEnter={onEnter}
                onSelect={(id, naam) => {
                  if (id !== undefined && id === regel.onderdeel_id) return
                  onWijzig({ onderdeel: naam ?? '', onderdeel_id: id, type_id: undefined, type: undefined, behandeling_id: undefined, behandeling: undefined })
                }}
              />
            : ti(KOL.onderdeel, regel.onderdeel, v => onWijzig({ onderdeel: v }), 'Onderdeel...', eersteRef)
          }
        </div>
      </td>

      {/* Type */}
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-0.5">
          {geselecteerdType?.code && (
            <span className="flex-shrink-0 text-[10px]  font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {geselecteerdType.code}
            </span>
          )}
          {schilderData && regel.onderdeel_id
            ? <ZoekInvoer
                value={regel.type}
                opties={beschikbareTypes}
                placeholder="Type..."
                celAdres={cel(KOL.type)}
                onFocus={onFocus}
                onEnter={onEnter}
                onSelect={(id, naam) => {
                  const t = id ? beschikbareTypes.find(tt => tt.id === id) : undefined
                  onWijzig({
                    type: naam ?? '', type_id: id,
                    behandeling_id: undefined, behandeling: undefined,
                    // De eenheid komt wél uit de bibliotheek, de formule niet meer: de
                    // opnemer geeft breedte- en hoogte-aantallen zelf op. `formule`
                    // leegmaken ruimt hem meteen op bij oude regels.
                    formule: undefined,
                    ...(t ? { eenheid: t.eenheid } : {}),
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
              celAdres={cel(KOL.behandeling)}
              onFocus={onFocus}
              onEnter={onEnter}
              onSelect={(id, naam) => onWijzig({ behandeling: naam ?? '', behandeling_id: id })}
            />
          : ti(KOL.behandeling, regel.behandeling, v => onWijzig({ behandeling: v }), 'Behandeling...')
        }
      </td>

      {/* B */}
      <td className="px-0.5 py-0.5 bg-blue-50/30">
        {ni(KOL.breedte, regel.breedte, v => onWijzig({ breedte: v }), '—', 'text-blue-700')}
      </td>

      {/* H */}
      <td className="px-0.5 py-0.5 bg-blue-50/30">
        {ni(KOL.hoogte, regel.hoogte, v => onWijzig({ hoogte: v }), '—', 'text-blue-700')}
      </td>

      {/* B aantal — hoeveel breedtes je meet; telt alleen mee bij m¹ */}
      <td className="px-0.5 py-0.5 bg-blue-50/20">
        {ni(KOL.breedteAantal, regel.breedte_aantal, v => onWijzig({ breedte_aantal: v }), '1', 'text-blue-400')}
      </td>

      {/* H aantal — hoeveel hoogtes je meet; telt alleen mee bij m¹ */}
      <td className="px-0.5 py-0.5 bg-blue-50/20">
        {ni(KOL.hoogteAantal, regel.hoogte_aantal, v => onWijzig({ hoogte_aantal: v }), '1', 'text-blue-400')}
      </td>

      {/* Factor — vermenigvuldiger op de hele regel */}
      <td className="px-0.5 py-0.5">
        {ni(KOL.factor, regel.factor, v => onWijzig({ factor: v }), '1')}
      </td>

      {/* Aantal */}
      <td className="px-0.5 py-0.5">
        {ni(KOL.aantal, regel.aantal === 1 && !regel.breedte && !regel.lengte ? undefined : regel.aantal, v => onWijzig({ aantal: v ?? 1 }), '1')}
      </td>

      {/* Hoeveelheid */}
      <td className="px-2 py-0.5 text-right">
        {hoev > 0 ? (
          <span className={`text-xs  font-semibold ${actief ? 'text-everts' : 'text-slate-300'}`}>
            {hoev.toFixed(2)}
          </span>
        ) : null}
      </td>

      {/* Eenheid — read-only */}
      <td className="px-1 py-0.5 text-center">
        <span className="text-xs  text-slate-400">{regel.eenheid}</span>
      </td>

      {/* Opmerking */}
      <td className="px-1 py-0.5">
        {ti(KOL.opmerking, regel.opmerking, v => onWijzig({ opmerking: v }), 'Opmerking...')}
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
