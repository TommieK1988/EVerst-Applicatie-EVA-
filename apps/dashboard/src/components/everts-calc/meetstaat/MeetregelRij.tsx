'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import type { Meetregel } from '@/lib/everts-calc/types'
import { berekenHoeveelheid, isRegelActief, normaliseerBestekcode } from '@/lib/everts-calc/meetstaat-utils'
import { plaatsZwevendPaneel, type PaneelPlek } from '@/components/ui/zwevend-paneel'
import { normaliseerEenheid, ontbrekendeMaat } from '@/lib/everts-calc/maat-rekenen'
import GetalInvoer from './GetalInvoer'

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
  /** id van de <datalist> met de bestekscodes die al in deze meetstaat voorkomen. */
  codeLijstId?: string
  /** Zelfde element als de regel erboven: de naam staat dan lichter. */
  elementHerhaald?: boolean
}

// ─── KOLOMADRESSEN ───────────────────────────────────────────────────────────
// Alleen de bewerkbare cellen tellen mee; #, vinkje, hoeveelheid, eenheid en de
// prullenbak zijn geen navigatiedoel. MeetregelGrid gebruikt dezelfde nummering.

export const KOL = {
  element: 0, onderdeel: 1, type: 2, code: 3,
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
  const [dropPos, setDropPos] = useState<(PaneelPlek & { left: number; width: number }) | null>(null)

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
      setDropPos({ ...plaatsZwevendPaneel(r, { hoogte: 208, afstand: 1 }), left: r.left, width: Math.max(r.width, 200) })
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
        className="w-full h-7 text-[13px] px-2 rounded-md bg-transparent border border-transparent text-neutral-800 placeholder:text-neutral-300 hover:bg-white hover:border-neutral-200 focus:bg-white focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 focus:outline-none"
      />
      {open && gefilterd.length > 0 && dropPos && (
        <div
          style={{ position: 'fixed', top: dropPos.top, bottom: dropPos.bottom, maxHeight: dropPos.maxHeight, left: dropPos.left, minWidth: dropPos.width, zIndex: 9999 }}
          className="overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-md py-1"
        >
          {gefilterd.slice(0, 25).map((o, i) => (
            <div
              key={o.id}
              onMouseDown={e => { e.preventDefault(); selecteer(o) }}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[13px] ${
                lijstActief && i === gemarkeerd ? 'bg-brand-50' : 'hover:bg-neutral-50'
              }`}
            >
              {o.code && (
                <span className="flex-shrink-0 font-semibold text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 min-w-[2rem] text-center">
                  {o.code}
                </span>
              )}
              <span className="text-neutral-800">{o.naam}</span>
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
  onFocus, onWijzig, onEnter, onVerwijder, schilderData, codeLijstId, elementHerhaald = false,
}: Props) {
  const eersteRef = useRef<HTMLInputElement>(null)
  const actief = isRegelActief(regel)
  const hoev = berekenHoeveelheid(regel)
  const perMaatAantal = normaliseerEenheid(regel.eenheid) === 'm¹'
  const ontbreekt = regel.is_leeg ? null : ontbrekendeMaat(regel)

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

  const ni = (kol: number, value: number | undefined, onChange: (v: number | undefined) => void, placeholder = '', cls = '') => (
    <GetalInvoer
      data-cel={cel(kol)}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      className={`w-full h-7 text-[13px] text-right tabular-nums px-1.5 rounded-md text-neutral-900
        ${regel.is_leeg ? 'bg-transparent border border-transparent hover:border-neutral-200' : 'bg-white border border-neutral-200 hover:border-neutral-300'}
        placeholder:text-neutral-300 focus:bg-white focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 focus:outline-none ${cls}`}
    />
  )

  const ti = (kol: number, value: string | undefined, onChange: (v: string) => void, placeholder = '', ref?: React.RefObject<HTMLInputElement>, cls = '') => (
    <input
      ref={ref} type="text" data-cel={cel(kol)} value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      className={`w-full h-7 text-[13px] px-2 rounded-md bg-transparent border border-transparent placeholder:text-neutral-300 hover:bg-white hover:border-neutral-200 focus:bg-white focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 focus:outline-none ${cls || 'text-neutral-800'}`}
    />
  )

  // Geselecteerd groen, onvolledig oranje, de lege slotregel licht; de regel waar je
  // in werkt krijgt een groene streep links (zoals het actieve item in de navigatie).
  const rijCls = `border-b border-neutral-100 transition-colors ${
    isGeselecteerd ? 'bg-brand-50' : ontbreekt ? 'bg-warning-50' : regel.is_leeg ? 'bg-neutral-50/60' : 'bg-white hover:bg-neutral-50'
  } ${isActief ? 'shadow-[inset_2px_0_0_#009439]' : ''}`

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
            className="w-3.5 h-3.5 rounded border-neutral-300 accent-brand-500 cursor-pointer"
          />
        )}
      </td>

      {/* # */}
      <td className="px-2 py-1 text-center">
        <span className={`text-xs tabular-nums ${actief ? 'text-neutral-400' : 'text-neutral-200'}`}>
          {actief ? volgnummer : ''}
        </span>
      </td>

      {/* Element */}
      <td className="px-1 py-0.5">
        {/* Dezelfde naam als de regel erboven staat lichter: zo zie je waar een element begint */}
        {ti(KOL.element, regel.element, v => onWijzig({ element: v }), 'Element...', undefined,
          elementHerhaald ? 'text-neutral-400' : 'font-semibold text-neutral-900')}
      </td>

      {/* Onderdeel */}
      <td className="px-1 py-0.5">
        <div className="flex items-center gap-0.5">
          {geselecteerdOnderdeel?.code && (
            <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
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
            <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
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
                    ...(t ? { eenheid: normaliseerEenheid(t.eenheid) } : {}),
                  })
                }}
              />
            : <span className="text-xs text-neutral-300 px-2 whitespace-nowrap">kies eerst onderdeel</span>
          }
        </div>
      </td>

      {/* Bestekscode — de behandeling kies je in de calculatie, per code in één keer */}
      <td className="px-1 py-0.5">
        <input
          type="text" data-cel={cel(KOL.code)} list={codeLijstId}
          value={regel.bestekcode ?? ''} placeholder="Code..."
          onChange={e => onWijzig({ bestekcode: e.target.value })}
          onBlur={e => {
            // De lege slotregel niet aanraken: die spiegelt alleen de regel erboven.
            if (regel.is_leeg) return
            const genormaliseerd = normaliseerBestekcode(e.target.value)
            if (genormaliseerd !== (regel.bestekcode ?? '')) onWijzig({ bestekcode: genormaliseerd || undefined })
          }}
          onFocus={onFocus}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
          className={`w-full max-w-[104px] h-7 text-xs font-semibold uppercase tabular-nums px-2 rounded-md text-info-700
            ${regel.bestekcode ? 'bg-info-50' : 'bg-transparent'} border border-transparent hover:border-neutral-200
            focus:bg-white focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 focus:outline-none
            placeholder:font-normal placeholder:normal-case placeholder:text-neutral-300`}
        />
        {regel.behandeling && (
          <span
            className="block truncate px-2 text-[11px] text-neutral-400"
            title="Behandeling uit een oudere meetstaat. Een behandeling kies je voortaan in de calculatie, per bestekscode."
          >
            {regel.behandeling}
          </span>
        )}
      </td>

      {/* B */}
      <td className="px-1 py-1">
        {ni(KOL.breedte, regel.breedte, v => onWijzig({ breedte: v }), '—')}
      </td>

      {/* H */}
      <td className="px-1 py-1">
        {ni(KOL.hoogte, regel.hoogte, v => onWijzig({ hoogte: v }), '—', ontbreekt?.includes('hoogte') ? '!border-warning-500 !bg-warning-50' : '')}
      </td>

      {/* B aantal / H aantal — hoeveel breedtes en hoogtes je meet, zoals op de papieren
          opmeetstaat. Tellen alleen bij m¹; bij andere eenheden is er niets in te vullen
          (geen veld, dus de pijltoetsen slaan de cel over). */}
      <td className="px-1 py-1">
        {perMaatAantal
          ? ni(KOL.breedteAantal, regel.breedte_aantal, v => onWijzig({ breedte_aantal: v }), '1', 'text-neutral-600')
          : <span className="block text-right text-xs px-2 text-neutral-300" title="Alleen bij m¹">—</span>}
      </td>
      <td className="px-1 py-1">
        {perMaatAantal
          ? ni(KOL.hoogteAantal, regel.hoogte_aantal, v => onWijzig({ hoogte_aantal: v }), '1', 'text-neutral-600')
          : <span className="block text-right text-xs px-2 text-neutral-300" title="Alleen bij m¹">—</span>}
      </td>

      {/* x (`factor`) — hoe vaak binnen één element; reist mee in een bewaard element */}
      <td className="px-1 py-1">
        {ni(KOL.factor, regel.factor, v => onWijzig({ factor: v }), '1')}
      </td>

      {/* Aantal */}
      <td className="px-1 py-1">
        {ni(KOL.aantal, regel.aantal === 1 && !regel.breedte && !regel.lengte ? undefined : regel.aantal, v => onWijzig({ aantal: v ?? 1 }), '1')}
      </td>

      {/* Hoeveelheid */}
      <td className="px-2 py-0.5 text-right">
        {hoev > 0 && !regel.is_leeg ? (
          <span className={`text-[13px] tabular-nums font-semibold ${actief ? 'text-brand-700' : 'text-neutral-300'}`}>
            {hoev.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : ontbreekt ? (
          <span className="text-xs font-semibold text-warning-700" title="Deze regel telt pas mee als alle maten zijn ingevuld">
            {ontbreekt} ontbreekt
          </span>
        ) : null}
      </td>

      {/* Eenheid — read-only */}
      <td className="px-1 py-0.5 text-center">
        <span className="text-xs text-neutral-500">{regel.eenheid}</span>
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
            className="p-1 text-neutral-300 hover:text-error-500 rounded-md transition-colors"
            title="Verwijder regel"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}
