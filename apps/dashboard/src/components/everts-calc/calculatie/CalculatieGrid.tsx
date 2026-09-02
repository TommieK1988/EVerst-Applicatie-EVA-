'use client'

import { useState, useEffect, useMemo, useCallback, useRef, cloneElement, forwardRef, useImperativeHandle, useTransition } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, AlignLeft, Search, MessageSquare, Undo2, Move, CopyPlus, X, PaintBucket, BookmarkPlus, Loader2, ImagePlus, Percent, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDialogen } from '@/components/ui/dialogen'
import { BulletTextarea } from '@/components/ui/bullet-textarea'
import {
  getGroepen, getCalculatieregels, getComponentregels,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp, upsertComponentregel,
  verwijderGroep, verwijderCalculatieregel, verwijderComponentregel, voegComponentregelToe,
  getMeetregelAggregaten, slaMeetregelAggregaatOp,
  herstelSnapshot,
} from '@/lib/everts-calc/local-store'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import {
  berekenCalculatieregel, berekenGroepKostprijs, berekenGroepVP,
  berekenGroepUren, berekenGroepMaterieel, berekenGroepOA,
  berekenScenarioKostprijs, berekenScenarioVP, berekeningNummers, formatEuro, formatGetal, parseGetal,
  scenarioDefaultOpslag,
} from '@/lib/everts-calc/calculations'
import { nieuweId, cn } from '@/lib/everts-calc/utils'
import type { Groep, Calculatieregel, Componentregel, Scenario, Eenheid, EenheidConfig } from '@/lib/everts-calc/types'
import { isTekstregel } from '@/lib/everts-calc/types'
import ConfirmDialog from '@/components/everts-calc/shared/ConfirmDialog'
import ActiviteitToevoegenModal from '@/components/everts-calc/calculatie/ActiviteitToevoegenModal'
import MiniMeetstaat from '@/components/everts-calc/calculatie/MiniMeetstaat'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import { laadBehandelingen } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import { heffingsPercentage, tariefKort, vindTarief, type BtwTariefKeuze } from '@/lib/stamdata/btw'
import { behandelingSuffix as maakBehandelingSuffix } from '@/lib/everts-calc/behandeling-label'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import { slaRegelOpAlsRecept } from '@/app/(platform)/everts-calc/actions/bibliotheek'
import { haalHuidigeGebruikerId } from '@/app/(platform)/everts-calc/actions/layouts-calc'
import { laadLayouts, slaLayoutOp, verwijderLayout, stelStandaardIn } from '@/app/actions/layouts'

import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'
import type { KolomConfig, GebruikerLayout } from '@everts/database/platform-types'

interface Props {
  scenarioId: string
  scenario: Scenario
  actiefGroepId: string | null
  onGroepActief: (id: string) => void
  onWijziging: () => void
  onUndoCountChange?: (count: number) => void
  /** Meldt of de diepste groepen allemaal ingeklapt zijn — voedt het label van de in-/uitklapknop. */
  onInklapStatusChange?: (allesIngeklapt: boolean) => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Alleen-lezen (bevroren calculatie): inhoud is te bekijken en in/uit te klappen,
   *  maar niets is bewerkbaar. */
  readOnly?: boolean
}

export interface CalculatieGridHandle {
  undo: () => void
  /** true = de diepste groepen inklappen (elke groepskop blijft zichtbaar, regels verdwijnen);
   *  false = alles uitklappen. */
  zetInklap: (ingeklapt: boolean) => void
  /** Zet een herstelpunt vóór een wijziging van buitenaf (structuurboom), zodat Ctrl+Z die terugdraait. */
  duwSnapshot: () => void
  /**
   * Leest groepen, regels en componenten opnieuw in. Nodig na een wijziging van buitenaf:
   * het grid laadt zijn gegevens verder alleen bij het openen, dus zonder dit blijft een
   * verplaatsing uit de structuurboom onzichtbaar tot je de pagina ververst.
   */
  herlaad: () => void
  /**
   * Wist het eigen opslag% van álle regels en componenten, zodat ze weer de
   * standaard-opslag van de calculatie volgen. Gebruikt door het opslagveld in de
   * totalenbalk. Daarna kan elke regel gewoon weer een eigen percentage krijgen.
   */
  wisRegelOpslagen: () => void
}

type Snapshot = { groepen: Groep[]; regels: Calculatieregel[]; componenten: Componentregel[] }

// ─── Kolom definities ─────────────────────────────────────────────────────────

type ColId =
  'kostengroep' | 'omschrijving' | 'aant' | 'eenh' | 'stelpost' | 'verrekenbaar' | 'markeer' |
  'uur_eenh' | 'min_eenh' | 'tarief_ab' | 'bedrag_ab' |
  'prijs_mt' | 'bedrag_mt' | 'prijs_oa' | 'bedrag_oa' |
  'tot_uren' |
  'kp_eenh' | 'tot_kp' | 'opslag_pct' | 'vp_eenh' | 'tot_vp' |
  'btw_pct' | 'acties'

interface ColDef {
  id: ColId; label: string; title?: string
  dw: number; minW: number; align: 'left' | 'right' | 'center'
  thCls?: string; tdCls?: string
  thStyle?: React.CSSProperties; tdStyle?: React.CSSProperties
}

const COL_DEFS: ColDef[] = [
  { id: 'kostengroep',  label: 'Kostengroep',  dw: 100, minW: 60,  align: 'left' },
  { id: 'omschrijving', label: 'Omschrijving', dw: 260, minW: 100, align: 'left' },
  { id: 'aant',         label: 'Aant.',        dw: 56,  minW: 40,  align: 'right' },
  { id: 'eenh',         label: 'Eenh.',        dw: 44,  minW: 36,  align: 'left' },
  { id: 'stelpost',     label: 'STP', title: 'Stelpost (provisorische som)', dw: 32, minW: 28, align: 'center' },
  { id: 'verrekenbaar', label: 'VRR', title: 'Verrekenbaar (wordt apart getoond in offerte)', dw: 32, minW: 28, align: 'center' },
  { id: 'markeer',      label: '⚑', title: 'Markeer regel', dw: 32, minW: 28, align: 'center' },
  { id: 'uur_eenh',  label: 'Uur/e.',    dw: 56,  minW: 40, align: 'right', thStyle: { color: '#1f6feb', backgroundColor: 'rgba(31,111,235,0.08)' }, tdStyle: { backgroundColor: 'rgba(31,111,235,0.04)' } },
  { id: 'min_eenh',  label: 'Min/e.',    dw: 56,  minW: 40, align: 'right', thStyle: { color: '#1f6feb', backgroundColor: 'rgba(31,111,235,0.08)' }, tdStyle: { backgroundColor: 'rgba(31,111,235,0.04)' } },
  { id: 'tarief_ab', label: 'Tarief AB', dw: 64,  minW: 48, align: 'right', thStyle: { color: '#1f6feb', backgroundColor: 'rgba(31,111,235,0.08)' }, tdStyle: { backgroundColor: 'rgba(31,111,235,0.04)' } },
  { id: 'bedrag_ab', label: 'Bedrag AB', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#1f6feb', backgroundColor: 'rgba(31,111,235,0.08)' }, tdStyle: { backgroundColor: 'rgba(31,111,235,0.04)' } },
  { id: 'prijs_mt',  label: 'Prijs MA',  dw: 68,  minW: 48, align: 'right', thStyle: { color: '#c2185b', backgroundColor: 'rgba(194,24,91,0.08)' },   tdStyle: { backgroundColor: 'rgba(194,24,91,0.04)' } },
  { id: 'bedrag_mt', label: 'Bedrag MA', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#c2185b', backgroundColor: 'rgba(194,24,91,0.08)' },   tdStyle: { backgroundColor: 'rgba(194,24,91,0.04)' } },
  { id: 'prijs_oa',  label: 'Prijs OA',  dw: 68,  minW: 48, align: 'right', thStyle: { color: '#7b1fa2', backgroundColor: 'rgba(123,31,162,0.08)' },  tdStyle: { backgroundColor: 'rgba(123,31,162,0.04)' } },
  { id: 'bedrag_oa', label: 'Bedrag OA', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#7b1fa2', backgroundColor: 'rgba(123,31,162,0.08)' },  tdStyle: { backgroundColor: 'rgba(123,31,162,0.04)' } },
  { id: 'tot_uren',  label: 'Tot. Uren', dw: 64,  minW: 48, align: 'right', thStyle: { color: '#1f6feb', backgroundColor: 'rgba(31,111,235,0.08)' },  tdStyle: { backgroundColor: 'rgba(31,111,235,0.04)' } },
  { id: 'kp_eenh',   label: 'KP/e.',    dw: 68,  minW: 48, align: 'right', thStyle: { color: '#009439', backgroundColor: 'rgba(0,148,57,0.08)' },     tdStyle: { backgroundColor: 'rgba(0,148,57,0.04)' } },
  { id: 'tot_kp',    label: 'Tot. KP',  dw: 80,  minW: 60, align: 'right', thStyle: { color: '#009439', backgroundColor: 'rgba(0,148,57,0.08)' },     tdStyle: { backgroundColor: 'rgba(0,148,57,0.04)' } },
  { id: 'opslag_pct',label: 'Opsl.%',   dw: 52,  minW: 44, align: 'right', thStyle: { color: '#009439', backgroundColor: 'rgba(0,148,57,0.08)' },     tdStyle: { backgroundColor: 'rgba(0,148,57,0.04)' } },
  { id: 'vp_eenh',   label: 'VP/e.',    dw: 68,  minW: 48, align: 'right', thStyle: { color: '#057a5c', backgroundColor: 'rgba(5,122,92,0.08)' },     tdStyle: { backgroundColor: 'rgba(5,122,92,0.04)' } },
  { id: 'tot_vp',    label: 'Tot. VP',  dw: 80,  minW: 60, align: 'right', thStyle: { color: '#057a5c', backgroundColor: 'rgba(5,122,92,0.08)' },     tdStyle: { backgroundColor: 'rgba(5,122,92,0.04)' } },
  { id: 'btw_pct',   label: 'BTW',     dw: 96,  minW: 64, align: 'right', thStyle: { color: '#b85a00', backgroundColor: 'rgba(184,90,0,0.08)' },     tdStyle: { backgroundColor: 'rgba(184,90,0,0.04)' } },
  { id: 'acties',    label: '',         dw: 28,  minW: 28, align: 'center' },
]

/**
 * Inspringing per groepsniveau (px) — puur visueel, zodat de nesting in het rekenblad
 * af te lezen is. Groepen herordenen doe je in de structuurboom, niet hier.
 */
const NIVEAU_INSPRING = 24

const COL_MAP     = Object.fromEntries(COL_DEFS.map(c => [c.id, c])) as Record<ColId, ColDef>
const DEFAULT_ORDER  = COL_DEFS.map(c => c.id) as ColId[]
const DEFAULT_WIDTHS = Object.fromEntries(COL_DEFS.map(c => [c.id, c.dw])) as Record<ColId, number>

// ─── Kolom-layouts (per gebruiker, tabel gebruiker_layouts, scherm 'evc_calculatie') ──
const LAYOUT_SCHERM = 'evc_calculatie'
/**
 * Eigen kolomnamen staan los van de layouts: ze horen bij de gebruiker, niet bij
 * een bepaalde kolomindeling. Daarom één vaste rij per gebruiker onder een eigen
 * scherm-sleutel, die direct wordt bewaard zodra je een kop hernoemt.
 */
const NAMEN_SCHERM = 'evc_calculatie_kolomnamen'
const NON_HIDEABLE_COLS: ColId[] = ['omschrijving', 'acties']

/** Huidige gridstaat → KolomConfig[] voor opslag. */
function stateNaarLayout(order: ColId[], hidden: Set<ColId>, widths: Record<ColId, number>): KolomConfig[] {
  return order.map((id, i) => ({ key: id, zichtbaar: !hidden.has(id), volgorde: i, breedte: widths[id] }))
}

/** Opgeslagen KolomConfig[] → gridstaat, tolerant voor toegevoegde/verwijderde kolommen. */
function layoutNaarState(cfg: KolomConfig[]): { colOrder: ColId[]; hiddenCols: Set<ColId>; colWidths: Record<ColId, number> } {
  const geldig = cfg.filter(c => (c.key as ColId) in COL_MAP)
  const gesorteerd = [...geldig].sort((a, b) => a.volgorde - b.volgorde).map(c => c.key as ColId)
  // Ontbrekende kolommen (nieuw sinds opslaan) achteraan toevoegen, zichtbaar
  const colOrder = [...gesorteerd, ...DEFAULT_ORDER.filter(id => !gesorteerd.includes(id))]
  const hiddenCols = new Set<ColId>(
    geldig.filter(c => !c.zichtbaar).map(c => c.key as ColId).filter(id => !NON_HIDEABLE_COLS.includes(id)),
  )
  const colWidths: Record<ColId, number> = { ...DEFAULT_WIDTHS }
  for (const c of geldig) {
    if (typeof c.breedte === 'number') {
      const min = COL_MAP[c.key as ColId]?.minW ?? 28
      colWidths[c.key as ColId] = Math.max(min, c.breedte)
    }
  }
  return { colOrder, hiddenCols, colWidths }
}

// ─── GetalInput ───────────────────────────────────────────────────────────────

/**
 * Numeriek invoerveld met Nederlandse opmaak: buiten focus zie je `12.345,67`,
 * bij het bewerken het kale getal zodat typen niet vecht met de scheidingstekens.
 *
 * Bewust `type="text"` — een `<input type="number">` kan geen duizendteken tonen.
 * De parser accepteert zowel komma als punt als decimaalteken (zie `parseGetal`).
 */
function GetalInput({
  waarde, onChange, decimalen = 2, className, title, onDoubleClick,
}: {
  waarde: number
  onChange: (v: number) => void
  decimalen?: number
  className?: string
  title?: string
  onDoubleClick?: (e: React.MouseEvent) => void
}) {
  const [edit, setEdit] = useState<string | null>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const selecteren = useRef(false)
  const toon = edit !== null
    ? edit
    : waarde === 0 ? '' : formatGetal(waarde, decimalen)

  // Bij focus de hele inhoud selecteren, zodat typen de bestaande waarde meteen vervangt
  // (anders moet je die eerst weghalen). Dat moet ná de commit: focus wisselt de weergave van
  // opgemaakt ("1.234,50") naar ruw ("1234.5"), en die waardewissel wist elke selectie.
  useEffect(() => {
    if (selecteren.current && edit !== null) {
      selecteren.current = false
      inputRef.current?.select()
    }
  }, [edit])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={toon}
      className={className}
      title={title}
      onDoubleClick={onDoubleClick}
      onFocus={() => {
        selecteren.current = true
        setEdit(waarde === 0 ? '' : String(+waarde.toFixed(decimalen)))
      }}
      onChange={e => { setEdit(e.target.value); onChange(parseGetal(e.target.value)) }}
      onBlur={() => { selecteren.current = false; setEdit(null) }}
    />
  )
}

// ─── TabelHeader ──────────────────────────────────────────────────────────────

interface TabelHeaderProps {
  colOrder: ColId[]
  colWidths: Record<ColId, number>
  /** Zichtbare naam per kolom: eigen naam van de gebruiker, anders die uit de instellingen, anders de standaard. */
  kolomNamen: Record<string, string>
  onHernoem: (col: ColId, naam: string) => void
  onStartResize: (col: ColId, e: React.MouseEvent) => void
  dragOverCol: ColId | null
  onColDragStart: (col: ColId) => void
  onColDragOver: (e: React.DragEvent, col: ColId) => void
  onColDrop: (col: ColId) => void
  onColDragEnd: () => void
}

function TabelHeader({
  colOrder, colWidths, kolomNamen, onHernoem, onStartResize, dragOverCol,
  onColDragStart, onColDragOver, onColDrop, onColDragEnd,
}: TabelHeaderProps) {
  // Dubbelklik op een kop = hernoemen. De <th> is draggable, dus tijdens het
  // bewerken zetten we dat uit — anders pakt de browser de drag i.p.v. de cursor.
  const [bewerkt,  setBewerkt]  = useState<ColId | null>(null)
  const [naamEdit, setNaamEdit] = useState('')

  const start = (id: ColId) => { setBewerkt(id); setNaamEdit(kolomNamen[id] ?? '') }
  const commit = () => {
    if (bewerkt) onHernoem(bewerkt, naamEdit)
    setBewerkt(null)
  }

  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-white border-b-2 border-slate-200 shadow-sm">
        {colOrder.map(id => {
          const col = COL_MAP[id]
          const inBewerking = bewerkt === id
          return (
            <th
              key={id}
              data-col={id}
              title={col.title ? `${col.title} — dubbelklik om te hernoemen` : 'Dubbelklik om te hernoemen'}
              draggable={id !== 'acties' && !inBewerking}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onColDragStart(id) }}
              onDragOver={e => onColDragOver(e, id)}
              onDrop={() => onColDrop(id)}
              onDragEnd={onColDragEnd}
              onDoubleClick={() => { if (id !== 'acties') start(id) }}
              className={[
                'relative px-2 py-2 text-[11px] font-normal uppercase tracking-wide',
                'whitespace-normal break-words leading-tight align-bottom',
                'select-none cursor-grab active:cursor-grabbing',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.thCls ?? (!col.thStyle ? 'text-slate-500' : ''),
                dragOverCol === id ? 'border-l-2 border-everts' : '',
              ].filter(Boolean).join(' ')}
              style={{ width: colWidths[id], ...col.thStyle }}
            >
              {inBewerking ? (
                <input
                  autoFocus
                  value={naamEdit}
                  placeholder={col.label}
                  onChange={e => setNaamEdit(e.target.value)}
                  onBlur={commit}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setBewerkt(null)
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  className="w-full normal-case tracking-normal text-[11px] px-1 py-0.5 rounded
                    border border-everts/50 bg-white text-slate-800 focus:outline-none"
                />
              ) : (
                kolomNamen[id] ?? col.label
              )}
              {id !== 'acties' && !inBewerking && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-everts/40 z-20"
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onStartResize(id, e) }}
                />
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

// ─── KolomNaamVeld ────────────────────────────────────────────────────────────

/** Hernoemveld in het kolommen-menu; bewaart pas bij verlaten of Enter. */
function KolomNaamVeld({
  waarde, standaard, onCommit,
}: {
  waarde: string
  standaard: string
  onCommit: (naam: string) => void
}) {
  const [tekst, setTekst] = useState(waarde)
  useEffect(() => { setTekst(waarde) }, [waarde])

  return (
    <input
      value={tekst}
      placeholder={standaard}
      onChange={e => setTekst(e.target.value)}
      onBlur={() => { if (tekst !== waarde) onCommit(tekst) }}
      onKeyDown={e => {
        if (e.key === 'Enter')  (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setTekst(waarde)
      }}
      className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded border border-transparent bg-transparent
        text-slate-700 placeholder-slate-400
        hover:border-slate-200 focus:bg-white focus:border-everts/40 focus:outline-none"
    />
  )
}

// ─── OmschrijvingVeld ─────────────────────────────────────────────────────────

/**
 * Invoerveld voor de omschrijving dat naar rechts uitschuift zodra de tekst niet
 * meer in de kolom past, zodat je de hele regel kunt lezen én bewerken.
 *
 * Het veld wordt tijdens het bewerken absoluut gepositioneerd binnen zijn eigen
 * wikkel; de wikkel houdt zijn plek in de flexrij (met de gemeten hoogte), zodat
 * de knoppen erachter niet verspringen.
 */
function OmschrijvingVeld({
  waarde, onWijzig, italic,
}: {
  waarde: string
  onWijzig: (v: string) => void
  italic?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const meetRef  = useRef<HTMLSpanElement>(null)
  /** Maten van vóór het uitschuiven — daarna staat het veld buiten de flow en
   *  zou een nieuwe meting de wikkel laten meegroeien (en blijven groeien). */
  const basisRef = useRef<{ w: number; h: number } | null>(null)
  const [gefocust,  setGefocust]  = useState(false)
  const [uitschuif, setUitschuif] = useState<number | null>(null)

  useEffect(() => {
    if (!gefocust) { setUitschuif(null); return }
    const basis = basisRef.current, meet = meetRef.current
    if (!basis || !meet) return
    const nodig = meet.offsetWidth + 18   // padding + ruimte voor de cursor
    setUitschuif(nodig > basis.w ? Math.min(nodig, 900) : null)
  }, [gefocust, waarde])

  const veldCls = `text-xs px-1 py-1 rounded border bg-transparent border-transparent
    hover:bg-slate-50 hover:border-slate-200
    focus:bg-white focus:border-everts/40 focus:outline-none text-slate-800 ${italic ? 'italic' : ''}`

  const basis = basisRef.current

  return (
    <div
      className="relative flex-1 min-w-0"
      style={uitschuif && basis ? { width: basis.w, height: basis.h, flex: 'none', zIndex: 40 } : undefined}
    >
      <input
        ref={inputRef}
        className={`w-full ${veldCls} ${uitschuif ? 'shadow-md' : ''}`}
        style={uitschuif ? { position: 'absolute', left: 0, top: 0, width: uitschuif, backgroundColor: '#fff' } : undefined}
        value={waarde}
        placeholder="Omschrijving..."
        maxLength={150}
        onFocus={e => {
          const el = e.currentTarget
          basisRef.current = { w: el.offsetWidth, h: el.offsetHeight }
          setGefocust(true)
        }}
        onBlur={() => setGefocust(false)}
        onChange={e => onWijzig(e.target.value)}
      />
      {gefocust && (
        <span
          ref={meetRef}
          aria-hidden
          className={`absolute invisible pointer-events-none whitespace-pre ${veldCls}`}
        >
          {waarde || 'Omschrijving...'}
        </span>
      )}
    </div>
  )
}

// ─── ComponentRegelRij ───────────────────────────────────────────────────────

function ComponentRegelRij({
  comp, uurtarieven, eenheden, colOrder, indent, regelOmschrijving, regelOpslag, onWijzig, onVerwijder,
}: {
  comp: Componentregel
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  colOrder: ColId[]
  indent: number
  regelOmschrijving: string
  regelOpslag: number
  onWijzig: (patch: Partial<Componentregel>) => void
  onVerwijder: () => void
}) {
  const typeConfig = {
    arbeid:         { badge: 'AB', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200' },
    materieel:      { badge: 'MA', badgeCls: 'bg-red-50 text-red-700 border-red-200' },
    onderaanneming: { badge: 'OA', badgeCls: 'bg-purple-50 text-purple-700 border-purple-200' },
  }
  const { badge, badgeCls } = typeConfig[comp.type]
  const inputCls = 'px-1.5 py-0.5 rounded border border-transparent bg-transparent hover:border-slate-200 focus:border-everts/40 focus:bg-white focus:outline-none text-xs text-slate-600'

  // Lokale bewerkstaat voor norm en tarief (live feedback, debounced opslaan)
  const [normEdit,    setNormEdit]    = useState(comp.norm_hoeveelheid)
  const [tariefEdit,  setTariefEdit]  = useState(comp.tarief)
  const [vpEenhEdit,  setVpEenhEdit]  = useState<string | null>(null)
  const [totVpEdit,   setTotVpEdit]   = useState<string | null>(null)
  const debRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const deb = (key: string, fn: () => void, ms = 400) => {
    clearTimeout(debRef.current[key]); debRef.current[key] = setTimeout(fn, ms)
  }

  // Sync wanneer parent component wijzigt (bijv. via calculatieregel-rij)
  useEffect(() => { setNormEdit(comp.norm_hoeveelheid) }, [comp.norm_hoeveelheid])
  useEffect(() => { setTariefEdit(comp.tarief) }, [comp.tarief])

  const tariefInLijst = uurtarieven.some(t => t.tarief === tariefEdit)

  // Bedragen + VP (gebruik lokale edit-staat voor live feedback).
  // Een detailregel rekent altijd per 1 hoeveelheid van de begrotingsregel: norm x tarief.
  // Vermenigvuldigen met het aantal gebeurt precies één keer, in de begrotingsregel zelf.
  // Deed de detailregel dat ook, dan stond hetzelfde aantal twee keer in de keten en week
  // de detailregel af van de rij eronder waar hij bij hoort.
  const compBedrag      = normEdit * tariefEdit
  const compKpPe        = compBedrag
  const effectiefOpslag = comp.opslag_pct ?? regelOpslag
  const compVpTotaal    = compBedrag * (1 + effectiefOpslag / 100)
  const compVpPe        = compVpTotaal

  const niComp = (val: number, onChange: (v: number) => void, decimalen = 2, cls = '') => (
    <GetalInput
      waarde={val}
      decimalen={decimalen}
      onChange={onChange}
      className={`w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent
        hover:bg-white hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none ${cls}`}
    />
  )

  const renderCompCell = (id: ColId): React.ReactNode => {
    const col = COL_MAP[id]
    const tdBase = `px-1 py-0.5 ${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`
    const tdSt = col.tdStyle

    switch (id) {
      case 'omschrijving': return (
        <td key={id} className="py-0.5" style={{ paddingLeft: `${indent + 20}px`, paddingRight: '4px' }}>
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex-shrink-0 ${badgeCls}`}>{badge}</span>
            <input
              placeholder="Omschrijving..."
              value={comp.omschrijving ?? regelOmschrijving}
              onChange={e => onWijzig({ omschrijving: e.target.value })}
              className={`flex-1 min-w-0 ${inputCls} text-slate-700`}
            />
            {/* Standaard uurtarieven selector bij arbeid */}
            {comp.type === 'arbeid' && uurtarieven.length > 0 && (
              <select
                value={tariefInLijst ? tariefEdit : '__custom__'}
                onChange={e => {
                  if (e.target.value !== '__custom__') {
                    const v = parseFloat(e.target.value)
                    setTariefEdit(v)
                    onWijzig({ tarief: v })
                  }
                }}
                className="text-[10px] text-blue-600 border-0 bg-blue-50 rounded px-1 py-0.5 focus:outline-none hover:bg-blue-100 flex-shrink-0 max-w-[120px]"
                title="Standaard uurtarief kiezen"
              >
                {uurtarieven.map(t => (
                  <option key={t.label} value={t.tarief}>{t.label}</option>
                ))}
                {!tariefInLijst && (
                  <option value="__custom__">Aangepast</option>
                )}
              </select>
            )}
            {comp.type === 'materieel' && (
              <input
                placeholder="Leverancier..."
                value={comp.leverancier ?? ''}
                onChange={e => onWijzig({ leverancier: e.target.value })}
                className={`flex-1 min-w-0 ${inputCls}`}
              />
            )}
            {comp.type === 'onderaanneming' && (
              <>
                <input
                  placeholder="Aannemersnaam..."
                  value={comp.aannemersnaam ?? ''}
                  onChange={e => onWijzig({ aannemersnaam: e.target.value })}
                  className={`flex-1 min-w-0 ${inputCls}`}
                />
                <input
                  placeholder="Offertenr..."
                  value={comp.offertenummer ?? ''}
                  onChange={e => onWijzig({ offertenummer: e.target.value })}
                  className={`w-24  ${inputCls}`}
                />
              </>
            )}
          </div>
        </td>
      )
      case 'aant': return (
        <td key={id} className={tdBase} style={tdSt}>
          {niComp(normEdit, v => { setNormEdit(v); deb('norm', () => onWijzig({ norm_hoeveelheid: v })) }, 3)}
        </td>
      )
      case 'eenh': return (
        <td key={id} className={`px-1 py-0.5 ${col.tdCls ?? ''}`}>
          <select
            value={comp.eenheid ?? (comp.type === 'arbeid' ? 'uur' : 'st')}
            onChange={e => onWijzig({ eenheid: e.target.value as Eenheid })}
            className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
              hover:bg-slate-50 hover:border hover:border-slate-200
              focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-600"
          >
            {eenheden
              .filter(e => !['STP', 'VRR', 'Stelpost', 'Verrekenbaar'].includes(e.afkorting))
              .map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
          </select>
        </td>
      )
      case 'uur_eenh': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'arbeid' && niComp(
            normEdit,
            v => { setNormEdit(v); deb('norm', () => onWijzig({ norm_hoeveelheid: v })) },
            2, 'text-blue-700'
          )}
        </td>
      )
      case 'min_eenh': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'arbeid' && niComp(
            +(normEdit * 60).toFixed(2),
            v => { const u = +(v / 60).toFixed(4); setNormEdit(u); deb('norm', () => onWijzig({ norm_hoeveelheid: u })) },
            2, 'text-blue-600'
          )}
        </td>
      )
      case 'tarief_ab': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'arbeid' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            2, 'text-blue-700'
          )}
        </td>
      )
      case 'bedrag_ab': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'arbeid' && compBedrag !== 0 && (
            <span className=" text-xs text-blue-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'prijs_mt': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'materieel' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            2, 'text-red-700'
          )}
        </td>
      )
      case 'bedrag_mt': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'materieel' && compBedrag !== 0 && (
            <span className=" text-xs text-red-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'prijs_oa': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'onderaanneming' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            2, 'text-purple-700'
          )}
        </td>
      )
      case 'bedrag_oa': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'onderaanneming' && compBedrag !== 0 && (
            <span className=" text-xs text-purple-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'tot_uren': return (
        <td key={id} className={tdBase} style={tdSt}>
          {comp.type === 'arbeid' && normEdit !== 0 && (
            <span className=" text-xs text-blue-600">{formatGetal(normEdit, 2)}</span>
          )}
        </td>
      )
      case 'kp_eenh': return (
        <td key={id} className={tdBase} style={tdSt}>
          {compKpPe !== 0 && <span className=" text-xs text-slate-600">{formatEuro(compKpPe)}</span>}
        </td>
      )
      case 'tot_kp': return (
        <td key={id} className={tdBase} style={tdSt}>
          {compBedrag !== 0 && <span className=" text-xs text-slate-700 font-semibold">{formatEuro(compBedrag)}</span>}
        </td>
      )
      case 'opslag_pct': return (
        <td key={id} className={tdBase} style={tdSt}>
          <div className="flex items-center justify-start gap-0.5">
            <input
              type="text" inputMode="decimal"
              value={comp.opslag_pct !== undefined ? +comp.opslag_pct.toFixed(2) : ''}
              placeholder={formatGetal(regelOpslag, 2)}
              onChange={e => onWijzig({ opslag_pct: e.target.value === '' ? undefined : parseGetal(e.target.value) })}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-transparent bg-transparent hover:border-slate-200 focus:border-everts/40 focus:bg-white focus:outline-none text-slate-600 placeholder-slate-300"
            />
            <span className="text-[10px] text-slate-300 flex-shrink-0">%</span>
          </div>
        </td>
      )
      case 'vp_eenh': return (
        <td key={id} className={tdBase} style={tdSt}>
          {vpEenhEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={vpEenhEdit}
              onChange={e => {
                setVpEenhEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && compKpPe !== 0) {
                  const pct = +((v / compKpPe - 1) * 100).toFixed(2)
                  onWijzig({ opslag_pct: pct })
                }
              }}
              onBlur={() => setVpEenhEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setVpEenhEdit(compVpPe === 0 ? '' : String(+compVpPe.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {compVpPe !== 0 ? formatEuro(compVpPe) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'tot_vp': return (
        <td key={id} className={tdBase} style={tdSt}>
          {totVpEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={totVpEdit}
              onChange={e => {
                setTotVpEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && compBedrag !== 0) {
                  const pct = +((v / compBedrag - 1) * 100).toFixed(2)
                  onWijzig({ opslag_pct: pct })
                }
              }}
              onBlur={() => setTotVpEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none font-bold text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts font-bold cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setTotVpEdit(compVpTotaal === 0 ? '' : String(+compVpTotaal.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {compVpTotaal !== 0 ? formatEuro(compVpTotaal) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'acties': return (
        <td key={id} className="px-1 py-1 text-center">
          <button
            onClick={onVerwijder}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
            title="Component verwijderen"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </td>
      )
      default: return <td key={id} className={tdBase} />
    }
  }

  return (
    <tr className="group border-b border-slate-100 bg-slate-50/50">
      {colOrder.map(id => renderCompCell(id))}
    </tr>
  )
}

// ─── Opslaan als recept modal ─────────────────────────────────────────────────

function OpslaanAlsReceptModal({
  regel, componenten, onSluiten,
}: {
  regel: Calculatieregel
  componenten: Componentregel[]
  onSluiten: () => void
}) {
  const categorieen = useInstellingen().categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
  const [isPending, start] = useTransition()
  const [naam, setNaam] = useState(regel.omschrijving)
  const [categorie, setCategorie] = useState(categorieen[0] ?? 'Schilderwerk')

  const opslaan = () => {
    if (!naam.trim()) return
    start(async () => {
      try {
        const normen = componenten.map(c => ({
          type: c.type as 'arbeid' | 'materieel' | 'onderaanneming',
          norm_hoeveelheid: c.norm_hoeveelheid,
          tarief: c.tarief,
          omschrijving: c.omschrijving,
          eenheid: c.eenheid,
        }))
        const { code } = await slaRegelOpAlsRecept({
          naam: naam.trim(),
          eenheid: regel.eenheid,
          categorie,
          normen,
        })
        toast.success(`Opgeslagen als recept ${code}`)
        onSluiten()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Fout bij opslaan')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onSluiten} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Opslaan als recept</h2>
          <button onClick={onSluiten} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Naam recept</label>
            <input
              autoFocus
              value={naam}
              onChange={e => setNaam(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') opslaan() }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Categorie</label>
            <select
              value={categorie}
              onChange={e => setCategorie(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            >
              {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {componenten.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              Deze regel heeft geen componentnormen. Het recept wordt opgeslagen zonder kosten.
            </p>
          )}
          <div className="text-xs text-slate-400 space-y-0.5">
            <div>Eenheid: <span className=" text-slate-600">{regel.eenheid}</span></div>
            <div>{componenten.length} {componenten.length === 1 ? 'norm' : 'normen'} ({componenten.filter(c => c.type === 'arbeid').length} arb, {componenten.filter(c => c.type === 'materieel').length} mat, {componenten.filter(c => c.type === 'onderaanneming').length} OA)</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onSluiten} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Annuleren
          </button>
          <button
            onClick={opslaan}
            disabled={isPending || !naam.trim()}
            className="px-4 py-2 text-sm font-semibold bg-everts hover:bg-everts-dark disabled:opacity-60 text-white rounded-lg flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Opslaan als recept
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CalculatieregelRij ───────────────────────────────────────────────────────

/**
 * Wat er op een regel wordt vastgelegd als je een BTW-tarief kiest: het te heffen
 * percentage plus het tarief zelf. Ook een verlegd tarief heft hier zijn nominale
 * percentage — zie de toelichting in lib/stamdata/btw.ts.
 */
function kiesBtwTarief(tarieven: BtwTariefKeuze[], tariefId: string): Partial<Calculatieregel> {
  const t = tarieven.find(x => x.id === tariefId)
  if (!t) return { btw_tarief_id: undefined, btw_pct: undefined }
  return { btw_tarief_id: t.id, btw_pct: heffingsPercentage(t) }
}

/**
 * Rij voor een tekstregel: één tekstvlak over de volle breedte van het rekenblad,
 * zonder aantal, prijs of componenten. Bewust een eigen component en niet een
 * variant binnen `CalculatieregelRij` — die rij hangt vol hooks en cel-logica die
 * voor een tekstregel allemaal niet van toepassing is.
 *
 * Slepen, selecteren en verwijderen werken exact als bij een gewone regel, zodat
 * de tekst tussen de posten op zijn plek te zetten is.
 */
function TekstregelRij({
  regel, colOrder, onWijzig, onVerwijder,
  isGeselecteerd, onSelecteer,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  readOnly = false,
}: {
  regel: Calculatieregel
  colOrder: ColId[]
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onVerwijder: () => void
  isGeselecteerd?: boolean
  onSelecteer?: (ctrlKey: boolean, shiftKey: boolean) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  readOnly?: boolean
}) {
  const veld = useRef<HTMLTextAreaElement>(null)

  // Hoogte volgt de inhoud, zodat een lange toelichting niet in een scrollbalkje verdwijnt.
  const pasHoogteAan = useCallback(() => {
    const el = veld.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { pasHoogteAan() }, [pasHoogteAan, regel.omschrijving])

  return (
    <tr
      className={cn(
        'group border-b border-slate-100 bg-sky-50/40 hover:bg-sky-100/50 transition-colors',
        isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
        isDragging ? 'opacity-40' : '',
        isDragOver ? 'border-t-2 border-t-everts' : ''
      )}
      draggable={!!onDragStart && !readOnly}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
      onDragOver={onDragOver}
      onDrop={e => { e.preventDefault(); onDrop?.(e) }}
      onDragEnd={onDragEnd}
      onMouseDown={e => {
        if (e.shiftKey && !(e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) {
          e.preventDefault()
        }
      }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) return
        onSelecteer?.(e.ctrlKey || e.metaKey, e.shiftKey)
      }}
      style={{ cursor: onDragStart ? 'grab' : undefined }}
    >
      <td colSpan={colOrder.length} className="px-2 py-1" style={{ paddingLeft: '4px' }}>
        <div className="flex items-start gap-2">
          <span
            className="mt-1 flex-shrink-0 text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded
              bg-sky-100 text-sky-700 border border-sky-200"
            title="Tekstregel — telt niet mee in de calculatie, komt wel in de offerte"
          >
            TEKST
          </span>
          <textarea
            ref={veld}
            value={regel.omschrijving ?? ''}
            onChange={e => { onWijzig(regel.id, { omschrijving: e.target.value }); pasHoogteAan() }}
            placeholder="Tekstregel voor in de offerte…"
            rows={1}
            disabled={readOnly}
            className="flex-1 min-w-0 text-xs px-2 py-1 border border-transparent rounded bg-transparent
              hover:border-slate-200 focus:bg-white focus:outline-none focus:border-everts/40
              focus:ring-1 focus:ring-everts/20 resize-none overflow-hidden
              text-slate-700 placeholder-slate-400 disabled:cursor-default"
          />
          {!readOnly && (
            <button
              onClick={onVerwijder}
              title="Tekstregel verwijderen"
              className="mt-0.5 flex-shrink-0 p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100
                hover:text-red-500 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

interface RegelRijProps {
  regel: Calculatieregel
  componenten: Componentregel[]
  diepte: number
  defaultOpslag: number
  colOrder: ColId[]
  btwTarieven: BtwTariefKeuze[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  scenarioId: string
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onWijzigComponent: (id: string, type: Componentregel['type'], norm: number, tarief: number) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
  onVerwijderComponent: (compId: string) => void
  onVerwijder: () => void
  onHerlaad: () => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Bibliotheek van schilderbehandelingen; één keer geladen door het grid. */
  behandelingen?: SchilderBehandeling[]
  isGeselecteerd?: boolean
  onSelecteer?: (ctrlKey: boolean, shiftKey: boolean) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  collapseSignal?: number
  readOnly?: boolean
}

function CalculatieregelRij({
  regel, componenten, diepte, defaultOpslag, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId,
  onWijzig, onWijzigComponent, onWijzigComponentExtra, onVoegComponentToe, onVerwijderComponent, onVerwijder, onHerlaad,
  bibliotheekItems, behandelingen = [],
  isGeselecteerd, onSelecteer,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  collapseSignal, readOnly = false,
}: RegelRijProps) {
  const regelComps = componenten.filter(c => c.calculatieregel_id === regel.id)
  const ab = regelComps.find(c => c.type === 'arbeid')
  const mt = regelComps.find(c => c.type === 'materieel')
  const oa = regelComps.find(c => c.type === 'onderaanneming')
  const allAb = regelComps.filter(c => c.type === 'arbeid')
  const allMt = regelComps.filter(c => c.type === 'materieel')
  const allOa = regelComps.filter(c => c.type === 'onderaanneming')
  const multiAb = allAb.length > 1
  const multiMt = allMt.length > 1
  const multiOa = allOa.length > 1
  const opslag = regel.opslag_pct ?? defaultOpslag

  const [abUren,   setAbUren]   = useState(ab?.norm_hoeveelheid ?? 0)
  const [abMin,    setAbMin]    = useState((ab?.norm_hoeveelheid ?? 0) * 60)
  const [abTarief, setAbTarief] = useState(ab?.tarief ?? 0)
  const [mtPrijs,  setMtPrijs]  = useState(mt?.tarief ?? 0)
  const [oaPrijs,  setOaPrijs]  = useState(oa?.tarief ?? 0)

  useEffect(() => {
    setAbUren(ab?.norm_hoeveelheid ?? 0)
    setAbMin((ab?.norm_hoeveelheid ?? 0) * 60)
    setAbTarief(ab?.tarief ?? 0)
  }, [ab?.norm_hoeveelheid, ab?.tarief])
  useEffect(() => { setMtPrijs(mt?.tarief ?? 0) }, [mt?.tarief])
  useEffect(() => { setOaPrijs(oa?.tarief ?? 0) }, [oa?.tarief])
  const compOpslagHash = regelComps.map(c => `${c.id}:${c.opslag_pct}`).join(',')
  useEffect(() => {
    const hasOverride = regelComps.some(c => c.opslag_pct !== undefined)
    if (!hasOverride || kp_pe === 0) return
    const avg = +((vp_pe / kp_pe - 1) * 100).toFixed(2)
    onWijzig(regel.id, { opslag_pct: avg })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compOpslagHash])

  const debRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const deb = (key: string, fn: () => void, ms = 400) => {
    clearTimeout(debRef.current[key]); debRef.current[key] = setTimeout(fn, ms)
  }

  // Uur ↔ Min bidirectioneel
  const onUrenChange = (v: number) => {
    setAbUren(v); setAbMin(+(v * 60).toFixed(2))
    deb('ab', () => onWijzigComponent(regel.id, 'arbeid', v, abTarief))
  }
  const onMinChange = (v: number) => {
    const u = +(v / 60).toFixed(4); setAbMin(v); setAbUren(u)
    deb('ab', () => onWijzigComponent(regel.id, 'arbeid', u, abTarief))
  }
  const onTariefAb = (v: number) => {
    setAbTarief(v); deb('abt', () => onWijzigComponent(regel.id, 'arbeid', abUren, v))
  }

  // Hoeveelheid van het enkele materiaal- of OA-component. De snelinvoerkolom in deze
  // rij bewerkt alleen de prijs; de hoeveelheid komt van de detailregel eronder en mag
  // hier nooit op 1 worden vastgezet — dan telt de rij een detailregel met hoeveelheid 2
  // maar één keer mee, terwijl het groepstotaal (dat met de opgeslagen componenten
  // rekent) wél klopt. Zonder component nog: 1, zoals een nieuw component krijgt.
  const mtNorm = mt?.norm_hoeveelheid ?? 1
  const oaNorm = oa?.norm_hoeveelheid ?? 1

  // Berekende waarden (op basis van lokale state)
  // `!== 0` en niet `> 0`: een minderwerkregel heeft een negatieve prijs en moet
  // net zo goed uit de lokale edit-staat komen, anders zie je tijdens het typen
  // nog de opgeslagen (of lege) waarde in plaats van je eigen invoer.
  const tmpComps = [
    ...(!multiAb && (abUren !== 0 || abTarief !== 0) ? [{ id: 'ab', calculatieregel_id: regel.id, type: 'arbeid'         as const, norm_hoeveelheid: abUren, tarief: abTarief, opslag_pct: ab?.opslag_pct }] : allAb),
    ...(!multiMt && mtPrijs !== 0                     ? [{ id: 'mt', calculatieregel_id: regel.id, type: 'materieel'      as const, norm_hoeveelheid: mtNorm, tarief: mtPrijs,  opslag_pct: mt?.opslag_pct }] : allMt),
    ...(!multiOa && oaPrijs !== 0                     ? [{ id: 'oa', calculatieregel_id: regel.id, type: 'onderaanneming' as const, norm_hoeveelheid: oaNorm, tarief: oaPrijs,  opslag_pct: oa?.opslag_pct }] : allOa),
  ]
  const { arbeid_totaal, materieel_totaal, oa_totaal, kp_pe, kp_totaal, uren_pe, uren_totaal, vp_pe, vp_totaal } =
    berekenCalculatieregel(regel, tmpComps, opslag)

  const hasCompOverride = regelComps.some(c => c.opslag_pct !== undefined)
  const displayOpslag = hasCompOverride && kp_pe !== 0
    ? +((vp_pe / kp_pe - 1) * 100).toFixed(2)
    : opslag
  /** Wijkt deze regel af van de standaard-opslag? Ook 0% telt als afwijking. */
  const heeftEigenOpslag = regel.opslag_pct !== undefined || hasCompOverride

  // Terugrekenen totaalprijs → eenheidsprijs
  const onBedragAb = (v: number) => {
    if (abUren !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (abUren * regel.hoeveelheid)).toFixed(4)
      setAbTarief(t); deb('abt', () => onWijzigComponent(regel.id, 'arbeid', abUren, t))
    }
  }
  const onBedragMt = (v: number) => {
    if (v !== 0 && mtNorm !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (mtNorm * regel.hoeveelheid)).toFixed(4)
      setMtPrijs(t); deb('mt', () => onWijzigComponent(regel.id, 'materieel', mtNorm, t))
    }
  }
  const onBedragOa = (v: number) => {
    if (v !== 0 && oaNorm !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (oaNorm * regel.hoeveelheid)).toFixed(4)
      setOaPrijs(t); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', oaNorm, t))
    }
  }

  const [werkUitgeklapt,         setWerkUitgeklapt]         = useState(false)
  const [compsUitgeklapt,        setCompsUitgeklapt]        = useState(false)
  useEffect(() => { if (collapseSignal) setCompsUitgeklapt(false) }, [collapseSignal])
  const [opmerkingOpen,          setOpmerkingOpen]          = useState(!!(regel.opmerking))
  const heeftBehandeling = !!(regel.schilderbehandeling_id || regel.schilderbehandeling)
  const behandelingNaam = regel.schilderbehandeling_id
    ? behandelingen.find(b => b.id === regel.schilderbehandeling_id)?.naam ?? ''
    : ''
  const behandelingSuffix = maakBehandelingSuffix(regel.omschrijving, behandelingNaam)
  const [schilderbehandelingOpen, setSchilderbehandelingOpen] = useState(heeftBehandeling)
  const [biblOpen,        setBiblOpen]        = useState(false)
  // Lokale edit-state voor totaalbedragen en verkoopprijzen
  const [mtBedragEdit, setMtBedragEdit] = useState<string | null>(null)
  const [oaBedragEdit, setOaBedragEdit] = useState<string | null>(null)
  const [vpEenhEdit,   setVpEenhEdit]   = useState<string | null>(null)
  const [totVpEdit,    setTotVpEdit]    = useState<string | null>(null)
  const [receptModalOpen, setReceptModalOpen] = useState(false)
  const [miniMeetstaat, setMiniMeetstaat]     = useState(false)

  const indent = 4
  const isSP   = regel.is_stelpost ?? false
  const isVRR  = regel.is_verrekenbaar ?? false
  const rowCls = regel.gemarkeerd ? 'bg-orange-50 italic' : isVRR ? 'bg-teal-50/40' : ''

  const ni = (val: number, onChange: (v: number) => void, decimalen = 2) => (
    <GetalInput
      waarde={val}
      decimalen={decimalen}
      onChange={onChange}
      className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent
        hover:bg-slate-50 hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none
        text-slate-700 placeholder-slate-200"
    />
  )

  const euro = (v: number, cls = 'text-slate-600') =>
    v !== 0
      ? <span className={` text-xs ${cls}`}>{formatEuro(v)}</span>
      : <span className="text-slate-200 text-xs">—</span>

  const renderCell = (id: ColId): React.ReactNode => {
    const col = COL_MAP[id]
    const base = `${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`
    const tdSt = col.tdStyle

    switch (id) {
      case 'kostengroep': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
              hover:bg-slate-50 hover:border hover:border-slate-200
              focus:bg-white focus:border focus:border-everts/40 focus:outline-none
              text-slate-600 placeholder-slate-300"
            value={regel.kostengroep ?? ''}
            placeholder="Groep…"
            list="kg-suggestions"
            onChange={e => onWijzig(regel.id, { kostengroep: e.target.value || undefined })}
          />
        </td>
      )
      case 'omschrijving': return (
        <td key={id} className={`py-1 ${isSP || regel.gemarkeerd ? 'italic' : ''}`} style={{ paddingLeft: `${indent}px`, paddingRight: '4px' }}>
          <div className="flex items-center gap-1">
            {/* Drag handle */}
            {onDragStart && (
              <span className="flex-shrink-0 opacity-20 group-hover:opacity-60 text-slate-500 cursor-grab text-sm select-none px-0.5" title="Versleep om te herordenen">⠿</span>
            )}
            {/* Vergrootglas: helemaal links */}
            <button
              onClick={e => { e.stopPropagation(); setBiblOpen(true) }}
              className="flex-shrink-0 p-0.5 rounded text-slate-300 hover:text-everts hover:bg-everts-50 opacity-0 group-hover:opacity-100 transition-all"
              title="Zoeken in bibliotheek"
            >
              <Search className="w-3 h-3" />
            </button>
            <ActiviteitToevoegenModal
              open={biblOpen}
              onClose={() => setBiblOpen(false)}
              elementId={regel.groep_id}
              scenarioId={scenarioId}
              onToegevoegd={() => { setBiblOpen(false); onHerlaad() }}
              bibliotheekItems={bibliotheekItems}
            />
            {isSP  && <span className="text-[10px] text-amber-500 font-semibold flex-shrink-0">[STP]</span>}
            {isVRR && <span className="text-[10px] text-teal-600 font-semibold flex-shrink-0">[VRR]</span>}
            {regel.meetstaat_aggregaat_id && (
              <span
                className="flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-200 leading-none"
                title="Afkomstig uit meetstaat"
              >MS</span>
            )}
            <OmschrijvingVeld
              waarde={regel.omschrijving}
              italic={regel.gemarkeerd}
              onWijzig={v => onWijzig(regel.id, { omschrijving: v })}
            />
            {/* Naam van de gekoppelde behandeling, afgeleid uit de bibliotheek — hij
                staat bewust náást het invoerveld, niet erin, zodat `omschrijving` de
                eigen tekst blijft. Belandt zo ook in de offerteregel. */}
            {behandelingSuffix && (
              <span
                className="flex-shrink min-w-0 truncate text-xs text-slate-500"
                title={`Schilderbehandeling: ${behandelingNaam}`}
              >
                {behandelingSuffix}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={() => setWerkUitgeklapt(v => !v)}
              className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer ${
                werkUitgeklapt || regel.werkomschrijving
                  ? 'text-everts bg-everts-50'
                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
              }`}
              title="Uitgebreide werkomschrijving"
            >
              <AlignLeft className="w-3 h-3" />
            </span>
            {/* Expand componentregels: rechts */}
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); setCompsUitgeklapt(v => !v) }}
              className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer ${
                compsUitgeklapt
                  ? 'text-everts bg-everts-50'
                  : regelComps.length > 0
                    ? 'text-slate-400 hover:text-everts hover:bg-everts-50'
                    : 'text-slate-200 hover:text-slate-400'
              }`}
              title="Componentregels tonen"
            >
              {compsUitgeklapt
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </span>
            {regel.opmerking && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Heeft interne opmerking" />
            )}
            {heeftBehandeling && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Heeft schilderbehandeling" />
            )}
          </div>
        </td>
      )
      case 'aant': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="w-full text-xs text-right  font-semibold px-1 py-0.5 block text-teal-600"
              title="Hoeveelheid vastgesteld door meetstaat — pas aan in de meetstaat"
            >
              {regel.hoeveelheid === 0 ? '—' : formatGetal(regel.hoeveelheid, 2)}
            </span>
          ) : (
            <>
              <GetalInput
                waarde={regel.hoeveelheid}
                onChange={v => onWijzig(regel.id, { hoeveelheid: v })}
                className="w-full text-xs text-right  font-semibold px-1 py-0.5 rounded border-0 bg-transparent
                  hover:bg-slate-50 hover:border hover:border-slate-200
                  focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-800"
                onDoubleClick={e => { e.stopPropagation(); setMiniMeetstaat(true) }}
                title="Dubbelklik om te meten"
              />
              <MiniMeetstaat
                open={miniMeetstaat}
                eenheid={regel.eenheid}
                hoeveelheid={regel.hoeveelheid}
                onSluiten={() => setMiniMeetstaat(false)}
                onBevestig={(hoeveelheid, eenheid) => {
                  onWijzig(regel.id, { hoeveelheid, ...(eenheid ? { eenheid } : {}) })
                  setMiniMeetstaat(false)
                }}
              />
            </>
          )}
        </td>
      )
      case 'eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="text-xs  text-teal-600 font-semibold px-1 py-0.5 block"
              title="Eenheid vastgesteld door meetstaat"
            >
              {regel.eenheid}
            </span>
          ) : (
            <select
              value={regel.eenheid}
              className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-slate-50 hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-600"
              onChange={e => {
                const eenh = e.target.value as Eenheid
                const patch: Partial<Calculatieregel> = { eenheid: eenh }
                // STP → Stelpost, VRR → Verrekenbaar (legacy volledige woorden blijven werken)
                patch.is_stelpost = eenh === 'STP' || eenh === 'Stelpost'
                patch.is_verrekenbaar = eenh === 'VRR' || eenh === 'Verrekenbaar'
                onWijzig(regel.id, patch)
              }}
            >
              {eenheden.map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
              {/* Toon huidige eenheid als die niet in de lijst staat */}
              {!eenheden.some(e => e.afkorting === regel.eenheid) && (
                <option key={regel.eenheid} value={regel.eenheid}>{regel.eenheid}</option>
              )}
            </select>
          )}
        </td>
      )
      case 'stelpost': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="checkbox"
            checked={isSP}
            onChange={e => onWijzig(regel.id, { is_stelpost: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
            title="Stelpost (provisorische som)"
          />
        </td>
      )
      case 'verrekenbaar': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="checkbox"
            checked={isVRR}
            onChange={e => onWijzig(regel.id, { is_verrekenbaar: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-teal-500 cursor-pointer"
            title="Verrekenbaar (wordt apart getoond in offerte)"
          />
        </td>
      )
      case 'tot_uren': return (
        <td key={id} className={`px-2 py-1 text-right ${base}`} style={tdSt}>
          {uren_totaal !== 0
            ? <span className=" text-xs text-blue-700">{formatGetal(uren_totaal, 2)}</span>
            : <span className="text-slate-200">—</span>
          }
        </td>
      )
      case 'markeer': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <button
            onClick={() => onWijzig(regel.id, { gemarkeerd: !(regel.gemarkeerd ?? false) })}
            className={`w-4 h-4 rounded-full border-2 transition-colors mx-auto block ${
              regel.gemarkeerd
                ? 'bg-orange-400 border-orange-500'
                : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50'
            }`}
            title="Markeer / Hef markering op"
          />
        </td>
      )
      case 'uur_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiAb
            ? <span className="text-xs  text-slate-400 block text-right px-1">{uren_pe !== 0 ? formatGetal(uren_pe, 2) : ''}</span>
            : ni(abUren, onUrenChange, 2)}
        </td>
      )
      case 'min_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiAb
            ? <span className="text-xs  text-slate-400 block text-right px-1">{uren_pe !== 0 ? formatGetal(uren_pe * 60, 2) : ''}</span>
            : ni(abMin, onMinChange, 2)}
        </td>
      )
      case 'tarief_ab': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiAb
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(abTarief, onTariefAb, 2)}
        </td>
      )
      case 'bedrag_ab': return <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>{ni(arbeid_totaal, onBedragAb, 2)}</td>
      case 'prijs_mt':  return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiMt
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(mtPrijs, v => { setMtPrijs(v); deb('mt', () => onWijzigComponent(regel.id, 'materieel', mtNorm, v)) }, 2)}
        </td>
      )
      case 'bedrag_mt': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="text" inputMode="decimal"
            value={mtBedragEdit !== null ? mtBedragEdit : (materieel_totaal === 0 ? '' : formatGetal(materieel_totaal, 2))}
            onFocus={() => setMtBedragEdit(materieel_totaal === 0 ? '' : String(+materieel_totaal.toFixed(2)))}
            onChange={e => { setMtBedragEdit(e.target.value); onBedragMt(parseGetal(e.target.value)) }}
            onBlur={() => setMtBedragEdit(null)}
            className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'prijs_oa':  return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiOa
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(oaPrijs, v => { setOaPrijs(v); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', oaNorm, v)) }, 2)}
        </td>
      )
      case 'bedrag_oa': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="text" inputMode="decimal"
            value={oaBedragEdit !== null ? oaBedragEdit : (oa_totaal === 0 ? '' : formatGetal(oa_totaal, 2))}
            onFocus={() => setOaBedragEdit(oa_totaal === 0 ? '' : String(+oa_totaal.toFixed(2)))}
            onChange={e => { setOaBedragEdit(e.target.value); onBedragOa(parseGetal(e.target.value)) }}
            onBlur={() => setOaBedragEdit(null)}
            className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'kp_eenh': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>{euro(kp_pe)}</td>
      )
      case 'tot_kp': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>{euro(kp_totaal, 'text-everts-dark font-semibold')}</td>
      )
      case 'opslag_pct': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>
          <div className="flex items-center justify-start gap-0.5">
            <input
              type="text" inputMode="decimal"
              // Leeg = geen eigen opslag, dus de standaard van de calculatie (placeholder).
              // Een ingevulde 0 is een échte keuze — verkoop tegen kostprijs — en moet
              // zichtbaar blijven staan, anders lijkt het alsof de standaard geldt.
              value={heeftEigenOpslag ? +displayOpslag.toFixed(2) : ''}
              placeholder={formatGetal(defaultOpslag, 2)}
              className="w-12 text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-white hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
              onChange={e => {
                // Veld leegmaken zet de regel terug op de standaard-opslag.
                const v = e.target.value === '' ? undefined : parseGetal(e.target.value)
                onWijzig(regel.id, { opslag_pct: v })
                if (ab) onWijzigComponentExtra(ab.id, { opslag_pct: undefined })
                if (mt) onWijzigComponentExtra(mt.id, { opslag_pct: undefined })
                if (oa) onWijzigComponentExtra(oa.id, { opslag_pct: undefined })
              }}
            />
            <span className="text-slate-400 text-[11px]">%</span>
          </div>
        </td>
      )
      case 'vp_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {vpEenhEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={vpEenhEdit}
              onChange={e => {
                setVpEenhEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && kp_pe !== 0) {
                  const pct = +((v / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setVpEenhEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setVpEenhEdit(vp_pe === 0 ? '' : String(+vp_pe.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_pe !== 0 ? formatEuro(vp_pe) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'tot_vp': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {totVpEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={totVpEdit}
              onChange={e => {
                setTotVpEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && kp_pe !== 0 && regel.hoeveelheid !== 0) {
                  const vpPe = v / regel.hoeveelheid
                  const pct = +((vpPe / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setTotVpEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none font-bold text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts font-bold cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setTotVpEdit(vp_totaal === 0 ? '' : String(+vp_totaal.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_totaal !== 0 ? formatEuro(vp_totaal) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'btw_pct': {
        // Regels van vóór de tariefkoppeling dragen alleen een percentage; die vallen terug
        // op het niet-verlegde tarief met dat percentage.
        const gekozen = vindTarief(btwTarieven, regel.btw_tarief_id, regel.btw_pct)
        return (
          <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>
            <select
              value={gekozen?.id ?? ''}
              title={gekozen ? gekozen.label : undefined}
              onChange={e => onWijzig(regel.id, kiesBtwTarief(btwTarieven, e.target.value))}
              className="w-full text-xs  text-right px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-white hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
            >
              <option value="">—</option>
              {btwTarieven.map(t => (
                <option key={t.id} value={t.id}>{tariefKort(t)}</option>
              ))}
            </select>
          </td>
        )
      }
      case 'acties': return (
        <td key={id} className="px-1 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setReceptModalOpen(true)}
              className="p-1 text-slate-300 hover:text-everts rounded transition-colors"
              title="Opslaan als recept"
            >
              <BookmarkPlus className="w-3 h-3" />
            </button>
            <button
              onClick={onVerwijder}
              className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      )
      default: return <td key={id} />
    }
  }

  return (
    <>
      <tr
        className={cn(
          'group border-b border-slate-100 hover:bg-blue-100/60 transition-colors',
          rowCls,
          isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
          isDragging ? 'opacity-40' : '',
          isDragOver ? 'border-t-2 border-t-everts' : ''
        )}
        draggable={!!onDragStart && !readOnly}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
        onDragOver={onDragOver}
        onDrop={e => { e.preventDefault(); onDrop?.(e) }}
        onDragEnd={onDragEnd}
        onMouseDown={e => {
          // Alleen preventDefault bij Shift om tekstselectie te voorkomen — dragging blijft werken
          if (e.shiftKey && !(e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) {
            e.preventDefault()
          }
        }}
        onClick={e => {
          if ((e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) return
          onSelecteer?.(e.ctrlKey || e.metaKey, e.shiftKey)
        }}
        style={{ cursor: onDragStart ? 'grab' : undefined }}
      >
        {colOrder.map(id => {
          const cell = renderCell(id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return cell ? cloneElement(cell as ReactElement<any>, { 'data-col': id }) : null
        })}
      </tr>
      {werkUitgeklapt && (
        <tr className={`border-b border-slate-100 ${regel.gemarkeerd ? 'bg-orange-50/60' : 'bg-slate-50/30'}`}>
          <td colSpan={colOrder.length} className="pb-2 pt-1 space-y-2" style={{ paddingLeft: `${indent + 8}px`, paddingRight: '12px' }}>
            <BulletTextarea
              autoFocus
              value={regel.werkomschrijving ?? ''}
              onChange={tekst => onWijzig(regel.id, { werkomschrijving: tekst })}
              placeholder="Uitgebreide werkomschrijving..."
              minRows={3}
              maxRows={30}
              toolbarClassName="-mt-0.5"
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white
                focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20
                text-slate-600 placeholder-slate-300 leading-relaxed"
            />
            {/* Afbeeldingen */}
            <div className="flex flex-wrap items-center gap-2">
              {(regel.werkomschrijving_afbeeldingen ?? []).map((src, idx) => (
                <div key={idx} className="relative group/img flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Afbeelding ${idx + 1}`}
                    className="w-24 h-20 object-contain border border-slate-200 rounded bg-white"
                  />
                  <button
                    onClick={() => {
                      const imgs = [...(regel.werkomschrijving_afbeeldingen ?? [])]
                      imgs.splice(idx, 1)
                      onWijzig(regel.id, { werkomschrijving_afbeeldingen: imgs.length ? imgs : undefined })
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full
                      flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title="Afbeelding verwijderen"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {/* Upload knop */}
              <label
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-everts
                  border border-dashed border-slate-300 hover:border-everts rounded cursor-pointer transition-colors"
                title="Afbeelding toevoegen"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Foto
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      const dataUrl = ev.target?.result as string
                      const huidige = regel.werkomschrijving_afbeeldingen ?? []
                      onWijzig(regel.id, { werkomschrijving_afbeeldingen: [...huidige, dataUrl] })
                    }
                    reader.readAsDataURL(file)
                    e.target.value = ''  // reset zodat hetzelfde bestand opnieuw gekozen kan worden
                  }}
                />
              </label>
            </div>
          </td>
        </tr>
      )}
      {compsUitgeklapt && (
        <>
          {regelComps.map(comp => (
            <ComponentRegelRij
              key={comp.id}
              comp={comp}
              uurtarieven={uurtarieven}
              eenheden={eenheden}
              colOrder={colOrder}
              indent={indent}
              regelOmschrijving={regel.omschrijving}
              regelOpslag={opslag}
              onWijzig={patch => onWijzigComponentExtra(comp.id, patch)}
              onVerwijder={() => onVerwijderComponent(comp.id)}
            />
          ))}
          <tr className="border-b border-slate-100 bg-slate-50/30">
            <td colSpan={colOrder.length} className="py-1" style={{ paddingLeft: `${indent + 20}px` }}>
              <div className="flex gap-2">
                <button
                  onClick={() => onVoegComponentToe(regel.id, 'arbeid')}
                  className="text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Arbeid
                </button>
                <button
                  onClick={() => onVoegComponentToe(regel.id, 'materieel')}
                  className="text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Materiaal
                </button>
                <button
                  onClick={() => onVoegComponentToe(regel.id, 'onderaanneming')}
                  className="text-[11px] text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                >
                  <Plus className="w-3 h-3" /> OA
                </button>
                <span className="text-slate-200 mx-1">|</span>
                <button
                  onClick={() => setOpmerkingOpen(v => !v)}
                  className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors ${
                    opmerkingOpen || regel.opmerking
                      ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Interne opmerking"
                >
                  <MessageSquare className="w-3 h-3" /> Opmerking
                </button>
                <button
                  onClick={() => setSchilderbehandelingOpen(v => !v)}
                  className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors ${
                    schilderbehandelingOpen || heeftBehandeling
                      ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Schilderbehandeling (zichtbaar op behandelingsblad)"
                >
                  <PaintBucket className="w-3 h-3" /> Behandeling
                </button>
              </div>
            </td>
          </tr>
          {opmerkingOpen && (
            <tr className="border-b border-amber-100 bg-amber-50/30">
              <td colSpan={colOrder.length} className="px-3 py-2" style={{ paddingLeft: `${indent + 20}px` }}>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-1.5 flex-shrink-0" />
                  <textarea
                    value={regel.opmerking ?? ''}
                    placeholder="Interne opmerking (niet zichtbaar voor opdrachtgever)..."
                    rows={2}
                    className="flex-1 text-xs px-2 py-1.5 border border-amber-200 rounded bg-white
                      focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100
                      resize-none text-slate-700 placeholder-slate-300"
                    onChange={e => onWijzig(regel.id, { opmerking: e.target.value || undefined })}
                  />
                  {regel.opmerking && (
                    <button
                      onClick={() => { onWijzig(regel.id, { opmerking: undefined }); setOpmerkingOpen(false) }}
                      className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors mt-0.5"
                      title="Opmerking verwijderen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
          {schilderbehandelingOpen && (
            <tr className="border-b border-blue-100 bg-blue-50/30">
              <td colSpan={colOrder.length} className="px-3 py-2" style={{ paddingLeft: `${indent + 20}px` }}>
                <SchilderbehandelingZoekveld
                  behandelingId={regel.schilderbehandeling_id}
                  behandelingTekst={regel.schilderbehandeling}
                  bibliotheek={behandelingen}
                  // Alleen de koppeling vastleggen — de tekst wordt pas bevroren bij het
                  // opstellen van de offerte, zodat de calculatie de bibliotheek volgt.
                  onSelecteer={b => onWijzig(regel.id, {
                    schilderbehandeling_id: b.id,
                    schilderbehandeling: undefined,
                  })}
                  onWis={() => {
                    onWijzig(regel.id, { schilderbehandeling: undefined, schilderbehandeling_id: undefined })
                    setSchilderbehandelingOpen(false)
                  }}
                />
              </td>
            </tr>
          )}
        </>
      )}
      {receptModalOpen && (
        <OpslaanAlsReceptModal
          regel={regel}
          componenten={regelComps}
          onSluiten={() => setReceptModalOpen(false)}
        />
      )}
    </>
  )
}

// ─── GroepSectie (recursief) ──────────────────────────────────────────────────

interface GroepSectieProps {
  groep: Groep
  diepte: number
  alleGroepen: Groep[]
  alleRegels: Calculatieregel[]
  alleComponenten: Componentregel[]
  nummers: Map<string, string>
  isActief: boolean
  defaultOpslag: number
  colOrder: ColId[]
  btwTarieven: BtwTariefKeuze[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  scenarioId: string
  onHerlaad: () => void
  onKlik: (id: string) => void
  onRegelWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onRegelComponentWijzig: (id: string, type: Componentregel['type'], norm: number, tarief: number) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
  onVerwijderComponent: (compId: string) => void
  onVerwijderRegel: (id: string) => void
  onVerwijderGroep: (id: string) => void
  onWijzigGroep: (id: string, patch: Partial<Groep>) => void
  /** Klap één groep in/uit — apart van onWijzigGroep, want in-/uitklappen is geen inhoudelijke wijziging. */
  onToggleInklap: (id: string) => void
  onVoegRegelToe: (groepId: string) => void
  onVoegTekstregelToe: (groepId: string) => void
  onVoegSubgroepToe: (groep: Groep) => void
  /** Groep waarboven een régel hangt — voor de blauwe ring bij regel-drops. */
  dragOverGroepId: string | null
  sleepRegelId: string | null
  /** Alle regels die met de huidige sleep meegaan (bij een multiselectie meer dan één). */
  sleepRegelIds: Set<string>
  onDragOver: (e: React.DragEvent, groep: Groep) => void
  onDrop: (e: React.DragEvent, doelGroep: Groep) => void
  onDragEnd: () => void
  onRegelDragStartNaarGroep: (regelId: string) => void
  onRegelDragEnd: () => void
  onRegelVerplaatsNaarPositie: (regelIds: string[], doelGroepId: string, voorRegelId: string | null) => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Bibliotheek van schilderbehandelingen; één keer geladen door het grid. */
  behandelingen?: SchilderBehandeling[]
  geselecteerdeRegels?: Set<string>
  onSelecteerRegel?: (regelId: string, ctrlKey: boolean, shiftKey: boolean) => void
  collapseSignal?: number
  readOnly?: boolean
}

function GroepSectie({
  groep, diepte, alleGroepen, alleRegels, alleComponenten, nummers,
  isActief, defaultOpslag, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId, onHerlaad,
  onKlik, onRegelWijzig, onRegelComponentWijzig, onWijzigComponentExtra,
  onVoegComponentToe, onVerwijderComponent,
  onVerwijderRegel, onVerwijderGroep, onWijzigGroep, onToggleInklap, onVoegRegelToe, onVoegTekstregelToe, onVoegSubgroepToe,
  dragOverGroepId, sleepRegelId, sleepRegelIds, onDragOver, onDrop, onDragEnd,
  onRegelDragStartNaarGroep, onRegelDragEnd, onRegelVerplaatsNaarPositie,
  bibliotheekItems, behandelingen = [],
  geselecteerdeRegels, onSelecteerRegel,
  collapseSignal, readOnly = false,
}: GroepSectieProps) {
  const ingeklapt = groep.ingeklapt ?? false
  const [confirmVerwijder, setConfirmVerwijder] = useState(false)
  const [editingNaam,     setEditingNaam]     = useState(false)
  const [naamEdit,        setNaamEdit]        = useState(groep.naam)
  useEffect(() => { setNaamEdit(groep.naam) }, [groep.naam])
  const [dragOverRegelId, setDragOverRegelId] = useState<string | null>(null)
  const directeRegels = alleRegels.filter(r => r.groep_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const subGroepen    = alleGroepen.filter(g => g.parent_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const kostprijs     = berekenGroepKostprijs(groep.id, alleGroepen, alleRegels, alleComponenten)
  const nummer        = nummers.get(groep.id) ?? ''
  const isRegelDropTarget   = sleepRegelId !== null && dragOverGroepId === groep.id
  const colCount      = colOrder.length

  // Alle regels die met deze sleep meegaan — bij een multiselectie is dat de hele
  // selectie, anders alleen de opgepakte regel. Het grid bepaalt de set.
  const handleRegelDragStart = (_e: React.DragEvent, id: string) => {
    onRegelDragStartNaarGroep(id)
  }
  const handleRegelDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (sleepRegelId && !sleepRegelIds.has(id)) setDragOverRegelId(id)
  }
  const handleRegelDrop = (targetId: string) => {
    setDragOverRegelId(null)
    // Op een regel die zelf meegesleept wordt kun je niet droppen.
    if (!sleepRegelId || sleepRegelIds.has(targetId)) return
    onRegelVerplaatsNaarPositie([...sleepRegelIds], groep.id, targetId)
  }
  const handleRegelDragEnd = () => {
    setDragOverRegelId(null)
    onRegelDragEnd()
  }

  // Groepstotalen — getoond in een eigen rij ónder de groep, per kolom uitgelijnd.
  // Alleen doorrekenen als er iets te tonen valt: elke berekening loopt de hele
  // subboom af en dat gebeurt bij elke render van elke groep opnieuw. Een groep
  // met alleen minderwerk komt negatief uit en heeft net zo goed een totaalrij.
  const toonTotalen = kostprijs !== 0
  const groepVP   = toonTotalen ? berekenGroepVP(groep.id, alleGroepen, alleRegels, alleComponenten, defaultOpslag) : 0
  const groepUren = toonTotalen ? berekenGroepUren(groep.id, alleGroepen, alleRegels, alleComponenten) : 0
  const groepMT   = toonTotalen ? berekenGroepMaterieel(groep.id, alleGroepen, alleRegels, alleComponenten) : 0
  const groepOA   = toonTotalen ? berekenGroepOA(groep.id, alleGroepen, alleRegels, alleComponenten) : 0

  const kopStijlen = [
    'text-white',
    'text-white border-b border-white/10',
    'bg-slate-100 text-slate-700 border-b border-slate-200',
  ]
  const kopBgStijlen: React.CSSProperties[] = [
    { backgroundColor: '#054f2e' },
    { backgroundColor: '#013a20' },
    {},
  ]
  const kopStijl   = kopStijlen[diepte] ?? kopStijlen[2]
  const kopBgStijl = kopBgStijlen[diepte] ?? kopBgStijlen[2]
  const kopPadding = diepte === 0 ? 'py-2.5' : 'py-1.5'
  const kopTekst   = diepte === 0 ? 'text-sm font-bold' : diepte === 1 ? 'text-xs font-semibold' : 'text-xs font-medium'
  /** Zichtbare inspringing per niveau, zodat de nesting af te lezen is. */
  const indent     = 4 + diepte * NIVEAU_INSPRING

  /** Totaalrij: hoe dieper de groep, hoe rustiger de streep eronder. */
  const totaalRijCls   = diepte === 0
    ? 'border-t-2 border-b-2 border-everts/30'
    : 'border-t border-b border-slate-200'
  const totaalRijStijl: React.CSSProperties = { backgroundColor: diepte === 0 ? 'rgba(5,79,46,0.07)' : 'rgba(241,245,249,0.9)' }
  const totaalTekst    = diepte === 0 ? 'text-everts-dark' : 'text-slate-600'

  return (
    <>
      <tr
        id={`groepkop-${groep.id}`}
        className={`border-b cursor-pointer group/kop select-none ${kopStijl} ${isActief ? 'ring-1 ring-inset ring-everts/50' : ''} ${isRegelDropTarget ? 'ring-2 ring-inset ring-blue-400' : ''}`}
        style={kopBgStijl}
        onClick={() => onKlik(groep.id)}
        onDragOver={e => onDragOver(e, groep)}
        onDrop={e => onDrop(e, groep)}
        onDragEnd={onDragEnd}
      >
        <td colSpan={colCount} className={kopPadding} style={{ paddingLeft: `${indent}px` }}>
          <div className="flex items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onToggleInklap(groep.id) }}
              className={`p-0.5 rounded cursor-pointer ${diepte <= 1 ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {ingeklapt ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
            <span className={` opacity-50 text-[11px] ${diepte <= 1 ? 'text-white' : ''}`}>{nummer}</span>
            {editingNaam ? (
              <input
                autoFocus
                value={naamEdit}
                onChange={e => setNaamEdit(e.target.value)}
                onBlur={() => {
                  setEditingNaam(false)
                  if (naamEdit.trim() && naamEdit.trim() !== groep.naam)
                    onWijzigGroep(groep.id, { naam: naamEdit.trim() })
                  else setNaamEdit(groep.naam)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') { setNaamEdit(groep.naam); setEditingNaam(false) }
                }}
                onClick={e => e.stopPropagation()}
                className={`bg-transparent border-b border-current/40 focus:outline-none ${kopTekst} min-w-[80px]`}
              />
            ) : (
              <span
                className={`${kopTekst} ${groep.optioneel ? 'italic opacity-60' : ''} cursor-text`}
                onDoubleClick={e => { e.stopPropagation(); setEditingNaam(true) }}
              >
                {groep.naam}
              </span>
            )}
            {groep.optioneel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-300 font-medium">
                optioneel
              </span>
            )}
            <span className={`text-[11px] opacity-50 ${diepte <= 1 ? 'text-white' : 'text-slate-500'}`}>
              {directeRegels.length > 0 && `${directeRegels.length} regel${directeRegels.length !== 1 ? 's' : ''}`}
              {subGroepen.length > 0 && ` · ${subGroepen.length} subgroep${subGroepen.length !== 1 ? 'en' : ''}`}
            </span>
            <div className="flex-1" />
            {/* De groepstotalen staan bewust niet meer hier maar in een eigen rij
                onder de groep, uitgelijnd op de bijbehorende kolommen. */}
            <div className="opacity-0 group-hover/kop:opacity-100 flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onWijzigGroep(groep.id, { optioneel: !groep.optioneel })}
                title={groep.optioneel ? 'Optioneel: telt niet mee in eindtotaal' : 'Markeer als optioneel'}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  groep.optioneel
                    ? 'border-amber-400 text-amber-600 bg-amber-50'
                    : diepte <= 1 ? 'border-white/30 text-white/50 hover:border-white/60 hover:text-white/80' : 'border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-600'
                }`}
              >
                OPT
              </button>
              <button
                onClick={() => onVoegRegelToe(groep.id)}
                className={`text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte <= 1 ? 'text-white/70 hover:text-white hover:bg-paper/10' : 'text-slate-400 hover:text-everts hover:bg-everts-50'}`}
              >
                <Plus className="w-3 h-3" /> Regel
              </button>
              <button
                onClick={() => onVoegTekstregelToe(groep.id)}
                title="Tekstregel — alleen tekst, telt niet mee in de calculatie maar komt wel in de offerte"
                className={`text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte <= 1 ? 'text-white/70 hover:text-white hover:bg-paper/10' : 'text-slate-400 hover:text-everts hover:bg-everts-50'}`}
              >
                <Plus className="w-3 h-3" /> Tekst
              </button>
              {groep.niveau < 3 && (
                <button
                  onClick={() => onVoegSubgroepToe(groep)}
                  className={`text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte <= 1 ? 'text-white/70 hover:text-white hover:bg-paper/10' : 'text-slate-400 hover:text-everts hover:bg-everts-50'}`}
                >
                  <Plus className="w-3 h-3" /> Groep
                </button>
              )}
              <button
                onClick={() => setConfirmVerwijder(true)}
                className={`p-1 rounded ${diepte <= 1 ? 'text-white/40 hover:text-red-300' : 'text-slate-300 hover:text-red-500'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </td>
      </tr>

      {!ingeklapt && (
        <>
          {directeRegels.map(r => isTekstregel(r) ? (
            <TekstregelRij
              key={r.id} regel={r} colOrder={colOrder}
              onWijzig={onRegelWijzig}
              onVerwijder={() => onVerwijderRegel(r.id)}
              isGeselecteerd={geselecteerdeRegels?.has(r.id)}
              onSelecteer={(ctrl, shift) => onSelecteerRegel?.(r.id, ctrl, shift)}
              isDragging={sleepRegelIds.has(r.id)}
              isDragOver={dragOverRegelId === r.id}
              onDragStart={e => handleRegelDragStart(e, r.id)}
              onDragOver={e => handleRegelDragOver(e, r.id)}
              onDrop={() => handleRegelDrop(r.id)}
              onDragEnd={handleRegelDragEnd}
              readOnly={readOnly}
            />
          ) : (
            <CalculatieregelRij
              key={r.id} regel={r} componenten={alleComponenten}
              diepte={diepte + 1} defaultOpslag={defaultOpslag} colOrder={colOrder} btwTarieven={btwTarieven}
              uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={onHerlaad}
              onWijzig={onRegelWijzig} onWijzigComponent={onRegelComponentWijzig}
              onWijzigComponentExtra={onWijzigComponentExtra}
              onVoegComponentToe={onVoegComponentToe}
              onVerwijderComponent={onVerwijderComponent}
              onVerwijder={() => onVerwijderRegel(r.id)}
              bibliotheekItems={bibliotheekItems}
              behandelingen={behandelingen}
              isGeselecteerd={geselecteerdeRegels?.has(r.id)}
              onSelecteer={(ctrl, shift) => onSelecteerRegel?.(r.id, ctrl, shift)}
              isDragging={sleepRegelIds.has(r.id)}
              isDragOver={dragOverRegelId === r.id}
              onDragStart={e => handleRegelDragStart(e, r.id)}
              onDragOver={e => handleRegelDragOver(e, r.id)}
              onDrop={() => handleRegelDrop(r.id)}
              onDragEnd={handleRegelDragEnd}
              collapseSignal={collapseSignal}
              readOnly={readOnly}
            />
          ))}
          {subGroepen.map(sub => (
            <GroepSectie
              key={sub.id} groep={sub} diepte={diepte + 1}
              alleGroepen={alleGroepen} alleRegels={alleRegels} alleComponenten={alleComponenten}
              nummers={nummers} isActief={isActief} defaultOpslag={defaultOpslag} colOrder={colOrder} btwTarieven={btwTarieven}
              uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={onHerlaad}
              onKlik={onKlik} onRegelWijzig={onRegelWijzig} onRegelComponentWijzig={onRegelComponentWijzig}
              onWijzigComponentExtra={onWijzigComponentExtra}
              onVoegComponentToe={onVoegComponentToe} onVerwijderComponent={onVerwijderComponent}
              onVerwijderRegel={onVerwijderRegel} onVerwijderGroep={onVerwijderGroep}
              onWijzigGroep={onWijzigGroep} onToggleInklap={onToggleInklap}
              onVoegRegelToe={onVoegRegelToe} onVoegTekstregelToe={onVoegTekstregelToe} onVoegSubgroepToe={onVoegSubgroepToe}
              dragOverGroepId={dragOverGroepId} sleepRegelId={sleepRegelId} sleepRegelIds={sleepRegelIds}
              onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
              onRegelDragStartNaarGroep={onRegelDragStartNaarGroep}
              onRegelDragEnd={onRegelDragEnd}
              onRegelVerplaatsNaarPositie={onRegelVerplaatsNaarPositie}
              bibliotheekItems={bibliotheekItems}
              behandelingen={behandelingen}
              geselecteerdeRegels={geselecteerdeRegels}
              onSelecteerRegel={onSelecteerRegel}
              collapseSignal={collapseSignal}
              readOnly={readOnly}
            />
          ))}

        </>
      )}

      {/* Groepstotaal — onderaan de groep, elk bedrag in zijn eigen kolom.
          Blijft ook zichtbaar als de groep is ingeklapt. */}
      {toonTotalen && (
        <tr className={totaalRijCls} style={totaalRijStijl}>
          {colOrder.map(id => {
            const uitlijning = COL_MAP[id].align === 'right' ? 'text-right' : COL_MAP[id].align === 'center' ? 'text-center' : 'text-left'
            const cel = (inhoud: React.ReactNode, extra = '') => (
              <td key={id} data-col={id} className={`px-2 py-1.5 ${uitlijning} ${extra}`}>{inhoud}</td>
            )
            switch (id) {
              case 'omschrijving': return (
                <td key={id} data-col={id} className="py-1.5 pr-2" style={{ paddingLeft: `${indent + 18}px` }}>
                  <span className={`text-xs font-semibold ${totaalTekst}`}>Totaal {groep.naam}</span>
                </td>
              )
              case 'tot_uren':  return cel(groepUren !== 0 ? <span className="text-xs font-semibold text-blue-700">{formatGetal(groepUren, 1)}</span> : null)
              case 'bedrag_mt': return cel(groepMT  !== 0 ? <span className="text-xs font-semibold text-red-700">{formatEuro(groepMT)}</span> : null)
              case 'bedrag_oa': return cel(groepOA  !== 0 ? <span className="text-xs font-semibold text-purple-700">{formatEuro(groepOA)}</span> : null)
              case 'tot_kp':    return cel(<span className="text-xs font-semibold text-everts-dark">{formatEuro(kostprijs)}</span>)
              case 'tot_vp':    return cel(<span className="text-xs font-bold text-everts">{formatEuro(groepVP)}</span>)
              default:          return <td key={id} data-col={id} className="py-1.5" />
            }
          })}
        </tr>
      )}

      <ConfirmDialog
        open={confirmVerwijder}
        onOpenChange={setConfirmVerwijder}
        title="Groep verwijderen?"
        description={`Groep "${groep.naam}" en alle onderliggende regels worden definitief verwijderd.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => { setConfirmVerwijder(false); onVerwijderGroep(groep.id) }}
      />
    </>
  )
}

// ─── Hoofd CalculatieGrid ─────────────────────────────────────────────────────

const CalculatieGrid = forwardRef<CalculatieGridHandle, Props>(function CalculatieGrid(
  { scenarioId, scenario, actiefGroepId, onGroepActief, onWijziging, onUndoCountChange, onInklapStatusChange, bibliotheekItems = [], readOnly = false },
  ref
) {
  const [groepen,     setGroepen]     = useState<Groep[]>([])
  const [regels,      setRegels]      = useState<Calculatieregel[]>([])
  const [componenten, setComponenten] = useState<Componentregel[]>([])
  const [nummers,     setNummers]     = useState<Map<string, string>>(new Map())
  const [nieuwGroepParent,    setNieuwGroepParent]    = useState<Groep | null>(null)
  const [nieuwGroepNaam,      setNieuwGroepNaam]      = useState('')
  const [nieuwRootGroepOpen,  setNieuwRootGroepOpen]  = useState(false)
  const [nieuwRootGroepNaam,  setNieuwRootGroepNaam]  = useState('')

  // Collapse-signaal voor componentregels
  const [collapseSignal, setCollapseSignal] = useState(0)

  // Selectie
  const [geselecteerdeRegels, setGeselecteerdeRegels] = useState<Set<string>>(new Set())

  // Move-to-group modal
  const [verplaatsModalOpen, setVerplaatsModalOpen] = useState(false)

  // Bulk-wijziging opslag% / BTW van de selectie
  const [opslagModalOpen, setOpslagModalOpen] = useState(false)
  const [opslagInvoer,    setOpslagInvoer]    = useState('')
  const [btwModalOpen,    setBtwModalOpen]    = useState(false)

  // Undo history
  const historyRef = useRef<Snapshot[]>([])

  // Intern klembord (Ctrl+C / Ctrl+X / Ctrl+V)
  const klembordRegels     = useRef<Calculatieregel[]>([])
  const klembordComponenten = useRef<Componentregel[]>([])

  // Regels slepen (binnen en tussen groepen). Groepen zelf herorden je in de
  // structuurboom: daar is elke rij een groep, dus zijn de doelen groot en eenduidig.
  const [sleepRegelId,  setSleepRegelId]  = useState<string | null>(null)
  /** Regels die met de huidige sleep meegaan: de hele selectie als je een
   *  geselecteerde regel oppakt, anders alleen die ene regel. */
  const [sleepRegelIds, setSleepRegelIds] = useState<Set<string>>(new Set())
  const [dragOverId,    setDragOverId]    = useState<string | null>(null)

  // Instellingen — geabonneerd, zodat de lijst uit Supabase ook doorkomt als de
  // hydratie pas ná de eerste render binnen is (dossiertab opent sneller dan de fetch).
  const _inst        = useInstellingen()
  const kolomNamen   = (_inst.kolom_namen ?? {}) as Record<string, string>
  const uurtarieven  = _inst.uurtarieven ?? []
  const eenheden     = _inst.eenheden ?? []

  // BTW-tarieven komen uit de stamgegevens (afgeleid uit Bouw7), niet uit de calc-instellingen:
  // zo staan de tarieven in de calculatie gelijk aan die in de offerte en in Bouw7.
  const [btwTarieven, setBtwTarieven] = useState<BtwTariefKeuze[]>([])
  useEffect(() => {
    laadBtwTarieven().then(setBtwTarieven).catch(() => setBtwTarieven([]))
  }, [])

  // Schilderbehandelingen: één keer voor het hele grid, zodat elke regel de naam
  // van zijn gekoppelde behandeling live kan tonen zonder eigen fetch per rij.
  const [behandelingen, setBehandelingen] = useState<SchilderBehandeling[]>([])
  useEffect(() => {
    laadBehandelingen().then(setBehandelingen).catch(() => setBehandelingen([]))
  }, [])

  // Kolom breedte + volgorde
  const [colWidths, setColWidths] = useState<Record<ColId, number>>(DEFAULT_WIDTHS)
  const [colOrder,  setColOrder]  = useState<ColId[]>(DEFAULT_ORDER)
  const [dragCol,     setDragCol]     = useState<ColId | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColId | null>(null)
  const resizeRef = useRef<{ col: ColId; startX: number; startW: number } | null>(null)
  const tabelRef  = useRef<HTMLTableElement>(null)
  const NON_HIDEABLE: ColId[] = ['omschrijving', 'acties']
  // Verborgen kolommen horen bij de kolom-layout (per gebruiker in de database,
  // zie gebruiker_layouts hieronder) en niet apart op dit apparaat: anders zag je
  // op je tweede scherm een andere kolomindeling dan op je eerste.
  const [hiddenCols, setHiddenCols] = useState<Set<ColId>>(new Set())
  const toggleHiddenCol = (id: ColId) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  // Kolom-layouts + kolommen-picker worden via een portal in de actiebalk getoond
  // (naast "Opties"); de slot leeft in CalculatieHoofdscherm.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setToolbarSlot(document.getElementById('calc-grid-toolbar-slot')) }, [])

  // Kolom-layouts per gebruiker (gebruiker_layouts)
  const [userId, setUserId]               = useState<string | null>(null)
  const [layouts, setLayouts]             = useState<GebruikerLayout[]>([])
  const [actiefLayoutId, setActiefLayoutId] = useState<string | null>(null)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const layoutMenuRef = useRef<HTMLDivElement>(null)
  const { vraagTekst } = useDialogen()

  // Eigen kolomnamen van deze gebruiker (leeg = de naam uit de instellingen/standaard)
  const [colNamen,      setColNamen]      = useState<Partial<Record<ColId, string>>>({})
  const [namenRijId,    setNamenRijId]    = useState<string | null>(null)

  const pasLayoutToe = useCallback((cfg: KolomConfig[], layoutId: string | null) => {
    const { colOrder: o, hiddenCols: h, colWidths: w } = layoutNaarState(cfg)
    setColOrder(o); setHiddenCols(h); setColWidths(w); setActiefLayoutId(layoutId)
  }, [])

  // Layouts + eigen kolomnamen laden bij mount; standaard-layout toepassen indien aanwezig
  useEffect(() => {
    let afgebroken = false
    ;(async () => {
      const id = await haalHuidigeGebruikerId()
      if (afgebroken || !id) return
      setUserId(id)
      const [rijen, namenRijen] = await Promise.all([
        laadLayouts(id, LAYOUT_SCHERM),
        laadLayouts(id, NAMEN_SCHERM),
      ])
      if (afgebroken) return
      setLayouts(rijen)
      const standaard = rijen.find(l => l.is_standaard)
      if (standaard) pasLayoutToe(standaard.kolommen, standaard.id)

      const namenRij = namenRijen[0]
      if (namenRij) {
        setNamenRijId(namenRij.id)
        const namen: Partial<Record<ColId, string>> = {}
        for (const c of namenRij.kolommen) {
          if (c.naam && (c.key as ColId) in COL_MAP) namen[c.key as ColId] = c.naam
        }
        setColNamen(namen)
      }
    })()
    return () => { afgebroken = true }
  }, [pasLayoutToe])

  const herlaadLayouts = useCallback(async () => {
    if (!userId) return
    setLayouts(await laadLayouts(userId, LAYOUT_SCHERM))
  }, [userId])

  /** Naam die je in de kop ziet: eigen naam > naam uit de instellingen > standaard. */
  const standaardKolomNaam = useCallback(
    (id: ColId) => kolomNamen[id] ?? COL_MAP[id].label,
    [kolomNamen],
  )
  const effectieveKolomNamen = useMemo(() => {
    const uit: Record<string, string> = {}
    for (const c of COL_DEFS) uit[c.id] = colNamen[c.id] ?? kolomNamen[c.id] ?? c.label
    return uit
  }, [colNamen, kolomNamen])

  const bewaarKolomNamen = useCallback(async (namen: Partial<Record<ColId, string>>) => {
    if (!userId) return
    const cfg: KolomConfig[] = Object.entries(namen)
      .map(([key, naam], i) => ({ key, zichtbaar: true, volgorde: i, naam: naam as string }))
    const res = await slaLayoutOp(userId, NAMEN_SCHERM, 'kolomnamen', cfg, namenRijId ?? undefined)
    if (!res.ok) { toast.error(res.error); return }
    if (!namenRijId && res.id) setNamenRijId(res.id)
  }, [userId, namenRijId])

  /** Kolom hernoemen. Leeg of gelijk aan de standaardnaam = terug naar standaard. */
  const zetKolomNaam = useCallback((id: ColId, naam: string) => {
    const schoon = naam.trim()
    const volgende = { ...colNamen }
    if (!schoon || schoon === standaardKolomNaam(id)) delete volgende[id]
    else volgende[id] = schoon
    setColNamen(volgende)
    void bewaarKolomNamen(volgende)
  }, [colNamen, standaardKolomNaam, bewaarKolomNamen])

  const layoutOpslaanAlsNieuw = useCallback(async () => {
    if (!userId) return
    const naam = (await vraagTekst({
      titel: 'Nieuwe kolom-layout',
      label: 'Naam',
      placeholder: 'Bijvoorbeeld: Calculatie compact',
      verplicht: true,
      bevestigLabel: 'Opslaan',
    }))?.trim()
    if (!naam) return
    if (layouts.some(l => l.naam.toLowerCase() === naam.toLowerCase())) {
      toast.error('Er bestaat al een layout met deze naam'); return
    }
    const res = await slaLayoutOp(userId, LAYOUT_SCHERM, naam, stateNaarLayout(colOrder, hiddenCols, colWidths))
    if (!res.ok) { toast.error(res.error); return }
    setActiefLayoutId(res.id ?? null)
    await herlaadLayouts()
    toast.success(`Layout "${naam}" opgeslagen`)
    setLayoutMenuOpen(false)
  }, [userId, layouts, colOrder, hiddenCols, colWidths, herlaadLayouts, vraagTekst])

  const layoutBijwerken = useCallback(async () => {
    if (!userId || !actiefLayoutId) return
    const huidig = layouts.find(l => l.id === actiefLayoutId)
    if (!huidig) return
    const res = await slaLayoutOp(userId, LAYOUT_SCHERM, huidig.naam, stateNaarLayout(colOrder, hiddenCols, colWidths), actiefLayoutId)
    if (!res.ok) { toast.error(res.error); return }
    await herlaadLayouts()
    toast.success(`Layout "${huidig.naam}" bijgewerkt`)
    setLayoutMenuOpen(false)
  }, [userId, actiefLayoutId, layouts, colOrder, hiddenCols, colWidths, herlaadLayouts])

  const layoutVerwijderen = useCallback(async (id: string) => {
    if (!userId) return
    const res = await verwijderLayout(id, userId)
    if (!res.ok) { toast.error(res.error); return }
    if (actiefLayoutId === id) {
      setActiefLayoutId(null)
      setColOrder(DEFAULT_ORDER); setColWidths(DEFAULT_WIDTHS); setHiddenCols(new Set())
    }
    await herlaadLayouts()
    toast.success('Layout verwijderd')
  }, [userId, actiefLayoutId, herlaadLayouts])

  const layoutStandaardZetten = useCallback(async (id: string) => {
    if (!userId) return
    const res = await stelStandaardIn(id, userId, LAYOUT_SCHERM)
    if (!res.ok) { toast.error(res.error); return }
    await herlaadLayouts()
    toast.success('Standaard-layout ingesteld')
  }, [userId, herlaadLayouts])

  // Layout-menu klik-buiten sluiten
  useEffect(() => {
    if (!layoutMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node))
        setLayoutMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [layoutMenuOpen])

  const defaultOpslag = scenarioDefaultOpslag(scenario)

  const laadAlles = useCallback(() => {
    const gs = getGroepen(scenarioId).sort((a, b) => a.volgorde - b.volgorde)
    const groepIds  = new Set(gs.map(g => g.id))
    const rs        = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds  = new Set(rs.map(r => r.id))
    const cs        = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
    setGroepen(gs); setRegels(rs); setComponenten(cs)
    setNummers(berekeningNummers(gs))
  }, [scenarioId])

  useEffect(() => { laadAlles() }, [laadAlles])

  // ─── Kolom picker klik-buiten sluiten ─────────────────────────────────────
  useEffect(() => {
    if (!colPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setColPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colPickerOpen])

  // ─── Undo ──────────────────────────────────────────────────────────────────
  const duwSnapshot = useCallback(() => {
    const snap: Snapshot = {
      groepen:    [...groepen],
      regels:     [...regels],
      componenten:[...componenten],
    }
    historyRef.current = [snap, ...historyRef.current].slice(0, 20)
    onUndoCountChange?.(historyRef.current.length)
  }, [groepen, regels, componenten, onUndoCountChange])

  const undo = useCallback(() => {
    const snap = historyRef.current.shift()
    if (!snap) return
    herstelSnapshot(scenarioId, snap.groepen, snap.regels, snap.componenten)
    setGroepen(snap.groepen)
    setRegels(snap.regels)
    setComponenten(snap.componenten)
    setNummers(berekeningNummers(snap.groepen))
    onUndoCountChange?.(historyRef.current.length)
    onWijziging()
    setGeselecteerdeRegels(new Set())
    toast.success('Ongedaan gemaakt')
  }, [scenarioId, onUndoCountChange, onWijziging])

  /** Groepen die zelf subgroepen hebben. Die blijven bij "inklappen" open staan,
   *  anders verdwijnen hun subgroepen uit beeld. */
  const groepenMetSubgroepen = useMemo(
    () => new Set(groepen.map(g => g.parent_id).filter((id): id is string => !!id)),
    [groepen]
  )

  const zetInklap = useCallback((ingeklapt: boolean) => {
    // Inklappen raakt alleen de diepste groepen: alle groepskoppen blijven zichtbaar,
    // alleen de calculatieregels verdwijnen. Uitklappen opent alles.
    const bijgewerkt = groepen.map(g => ({ ...g, ingeklapt: ingeklapt && !groepenMetSubgroepen.has(g.id) }))
    bijgewerkt.forEach((g, i) => { if ((groepen[i].ingeklapt ?? false) !== g.ingeklapt) slaGroepOp(g) })
    setGroepen(bijgewerkt)
    if (ingeklapt) setCollapseSignal(s => s + 1)
  }, [groepen, groepenMetSubgroepen])

  const handleToggleInklap = useCallback((id: string) => {
    const groep = groepen.find(g => g.id === id)
    if (!groep) return
    const bijgewerkt = { ...groep, ingeklapt: !(groep.ingeklapt ?? false) }
    slaGroepOp(bijgewerkt)
    setGroepen(prev => prev.map(g => g.id === id ? bijgewerkt : g))
  }, [groepen])

  /** Alles ingeklapt = elke diepste groep is dicht. Bepaalt of de knop in- of uitklapt. */
  const allesIngeklapt = useMemo(() => {
    const diepste = groepen.filter(g => !groepenMetSubgroepen.has(g.id))
    return diepste.length > 0 && diepste.every(g => g.ingeklapt)
  }, [groepen, groepenMetSubgroepen])

  useEffect(() => { onInklapStatusChange?.(allesIngeklapt) }, [allesIngeklapt, onInklapStatusChange])

  /** Alle eigen opslagpercentages weg; de regels vallen terug op de calculatie-opslag. */
  const wisRegelOpslagen = useCallback(() => {
    if (readOnly) return
    const nieuweRegels = regels.map(r => {
      if (r.opslag_pct === undefined) return r
      const bijgewerkt = { ...r, opslag_pct: undefined }
      slaCalculatieregelOp(bijgewerkt)
      return bijgewerkt
    })
    const nieuweComponenten = componenten.map(c => {
      if (c.opslag_pct === undefined) return c
      const bijgewerkt = { ...c, opslag_pct: undefined }
      slaComponentregelOp(bijgewerkt)
      return bijgewerkt
    })
    setRegels(nieuweRegels)
    setComponenten(nieuweComponenten)
    onWijziging()
  }, [readOnly, regels, componenten, onWijziging])

  useImperativeHandle(ref, () => ({ undo, zetInklap, duwSnapshot, herlaad: laadAlles, wisRegelOpslagen }),
    [undo, zetInklap, duwSnapshot, laadAlles, wisRegelOpslagen])

  // ─── Selectie ──────────────────────────────────────────────────────────────
  const handleSelecteerRegel = useCallback((regelId: string, ctrlKey: boolean, shiftKey: boolean) => {
    setGeselecteerdeRegels(prev => {
      const next = new Set(prev)
      if (ctrlKey) {
        // Toggle individual regel
        if (next.has(regelId)) next.delete(regelId)
        else next.add(regelId)
      } else if (shiftKey) {
        // Shift: selecteer bereik in volgorde van alle zichtbare regels
        const alleIds = regels.map(r => r.id)
        const lastSelected = Array.from(prev).pop()
        const fromIdx = lastSelected ? alleIds.indexOf(lastSelected) : -1
        const toIdx   = alleIds.indexOf(regelId)
        if (fromIdx !== -1 && toIdx !== -1) {
          const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          for (let i = lo; i <= hi; i++) next.add(alleIds[i])
        } else {
          next.add(regelId)
        }
      } else {
        // Enkel
        next.clear(); next.add(regelId)
      }
      return next
    })
  }, [regels])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return  // bevroren calculatie: geen bewerk-sneltoetsen
      const ctrl   = e.ctrlKey || e.metaKey
      const shift  = e.shiftKey
      const tag    = (e.target as HTMLElement).tagName
      const inVeld = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)

      // Browser-shortcuts altijd blokkeren (ook in invoerveld), maar alleen uitvoeren buiten veld
      if (ctrl && !shift && e.key === 'r') {
        e.preventDefault()
        if (inVeld) return
        if (actiefGroepId) handleVoegRegelToe(actiefGroepId)
        else toast('Selecteer eerst een groep', { icon: 'ℹ️' })
        return
      }
      if (ctrl && !shift && e.key === 'g') {
        e.preventDefault()
        if (inVeld) return
        voegRootGroepToe()
        return
      }
      // Ctrl+Shift+R → tekstregel in de actieve groep
      if (ctrl && shift && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        if (inVeld) return
        if (actiefGroepId) handleVoegTekstregelToe(actiefGroepId)
        else toast('Selecteer eerst een groep', { icon: 'ℹ️' })
        return
      }

      // Overige shortcuts: skip als focus in invoerveld
      if (inVeld) return

      // Ctrl+Z → Undo
      if (ctrl && !shift && e.key === 'z') {
        e.preventDefault(); undo(); return
      }
      // Escape → deselecteer
      if (e.key === 'Escape') {
        setGeselecteerdeRegels(new Set()); return
      }
      // Alleen door als er regels geselecteerd zijn
      if (geselecteerdeRegels.size === 0) return

      // Delete / Backspace of Ctrl+Shift+R → verwijder geselecteerde regels
      if (e.key === 'Delete' || e.key === 'Backspace' || (ctrl && shift && e.key === 'R')) {
        e.preventDefault(); handleVerwijderGeselecteerd(); return
      }
      // Ctrl+D → dupliceer (interne kopie + plak direct)
      if (ctrl && !shift && e.key === 'd') {
        e.preventDefault(); handleKopieerRegels(); return
      }
      // Ctrl+C → kopieer naar intern klembord
      if (ctrl && !shift && e.key === 'c') {
        e.preventDefault()
        klembordRegels.current = Array.from(geselecteerdeRegels)
          .map(id => regels.find(r => r.id === id))
          .filter((r): r is Calculatieregel => !!r)
        klembordComponenten.current = componenten.filter(c =>
          geselecteerdeRegels.has(c.calculatieregel_id)
        )
        toast.success(`${klembordRegels.current.length} regel${klembordRegels.current.length !== 1 ? 's' : ''} gekopieerd`)
        return
      }
      // Ctrl+X → knip (kopieer + verwijder)
      if (ctrl && !shift && e.key === 'x') {
        e.preventDefault()
        klembordRegels.current = Array.from(geselecteerdeRegels)
          .map(id => regels.find(r => r.id === id))
          .filter((r): r is Calculatieregel => !!r)
        klembordComponenten.current = componenten.filter(c =>
          geselecteerdeRegels.has(c.calculatieregel_id)
        )
        handleVerwijderGeselecteerd()
        toast.success(`${klembordRegels.current.length} regel${klembordRegels.current.length !== 1 ? 's' : ''} geknipt`)
        return
      }
      // Ctrl+V → plak na geselecteerde regel (of achteraan actieve groep)
      if (ctrl && !shift && e.key === 'v') {
        e.preventDefault()
        if (klembordRegels.current.length === 0) return
        // Bepaal ankerpunt: geselecteerde regel of actieve groep
        const geselecteerdArr = Array.from(geselecteerdeRegels)
        const ankerRegel = geselecteerdArr.length === 1
          ? regels.find(r => r.id === geselecteerdArr[0])
          : null
        const doelGroepId = ankerRegel?.groep_id ?? actiefGroepId
        if (!doelGroepId) return
        duwSnapshot()
        // Regels in doelgroep gesorteerd; invoegen na anker (of achteraan)
        const doelRegels = regels.filter(r => r.groep_id === doelGroepId).sort((a, b) => a.volgorde - b.volgorde)
        const ankerIdx   = ankerRegel ? doelRegels.findIndex(r => r.id === ankerRegel.id) : doelRegels.length - 1
        const startVolgorde = ankerIdx + 2  // 1-based, na anker
        // Schuif bestaande regels na anker op
        doelRegels.slice(ankerIdx + 1).forEach((r, i) => {
          slaCalculatieregelOp({ ...r, volgorde: startVolgorde + klembordRegels.current.length + i })
        })
        const geplakt: Calculatieregel[] = []
        klembordRegels.current.forEach((orig, i) => {
          const nieuw: Calculatieregel = {
            ...orig, id: nieuweId(),
            groep_id: doelGroepId,
            volgorde: startVolgorde + i,
          }
          slaCalculatieregelOp(nieuw)
          klembordComponenten.current
            .filter(c => c.calculatieregel_id === orig.id)
            .forEach(comp => slaComponentregelOp({ ...comp, id: nieuweId(), calculatieregel_id: nieuw.id }))
          geplakt.push(nieuw)
        })
        laadAlles(); onWijziging()
        setGeselecteerdeRegels(new Set(geplakt.map(r => r.id)))
        toast.success(`${geplakt.length} regel${geplakt.length !== 1 ? 's' : ''} geplakt`)
        return
      }
      // Ctrl+M → verplaats naar andere groep
      if (ctrl && !shift && e.key === 'm') {
        e.preventDefault(); setVerplaatsModalOpen(true); return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, geselecteerdeRegels, actiefGroepId, regels, componenten, duwSnapshot, laadAlles, onWijziging, readOnly])

  // ─── Multi-select acties ───────────────────────────────────────────────────
  const handleKopieerRegels = useCallback(() => {
    if (geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const nieuwRegels: Calculatieregel[] = []
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => {
      const orig = regels.find(r => r.id === id)
      if (!orig) return
      const kopie: Calculatieregel = { ...orig, id: nieuweId(), omschrijving: `${orig.omschrijving} (kopie)`, volgorde: regels.filter(r => r.groep_id === orig.groep_id).length + nieuwRegels.filter(r => r.groep_id === orig.groep_id).length + 1 }
      slaCalculatieregelOp(kopie)
      // Kopieer ook componentregels
      componenten.filter(c => c.calculatieregel_id === id).forEach(comp => {
        const nieuwComp: Componentregel = { ...comp, id: nieuweId(), calculatieregel_id: kopie.id }
        slaComponentregelOp(nieuwComp)
      })
      nieuwRegels.push(kopie)
    })
    laadAlles(); onWijziging()
    setGeselecteerdeRegels(new Set(nieuwRegels.map(r => r.id)))
    toast.success(`${nieuwRegels.length} regel${nieuwRegels.length !== 1 ? 's' : ''} gekopieerd`)
  }, [geselecteerdeRegels, regels, componenten, duwSnapshot, laadAlles, onWijziging])

  const handleVerwijderGeselecteerd = useCallback(() => {
    if (geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => verwijderCalculatieregel(id))
    setRegels(prev => prev.filter(r => !geselecteerdeRegels.has(r.id)))
    setComponenten(prev => prev.filter(c => !geselecteerdeRegels.has(c.calculatieregel_id)))
    setGeselecteerdeRegels(new Set())
    onWijziging()
    toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} verwijderd`)
  }, [geselecteerdeRegels, duwSnapshot, onWijziging])

  // Bijwerken van gekoppeld MeetregelAggregaat na groep-verplaatsing
  const syncAggregaatGroep = useCallback((regelId: string, nieuweGroepId: string) => {
    const aggs = getMeetregelAggregaten()
    const agg  = aggs.find(a => a.calculatieregel_id === regelId)
    if (agg && agg.groep_id !== nieuweGroepId) {
      slaMeetregelAggregaatOp({ ...agg, groep_id: nieuweGroepId })
    }
  }, [])

  const handleVerplaatsNaarGroep = useCallback((doelGroepId: string) => {
    if (geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    const doelRegels = regels.filter(r => r.groep_id === doelGroepId)
    let volgorde = doelRegels.length + 1
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      const bijgewerkt = { ...r, groep_id: doelGroepId, volgorde: volgorde++ }
      slaCalculatieregelOp(bijgewerkt)
      syncAggregaatGroep(id, doelGroepId)
    })
    laadAlles(); onWijziging()
    setVerplaatsModalOpen(false)
    setGeselecteerdeRegels(new Set())
    toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} verplaatst`)
  }, [geselecteerdeRegels, regels, duwSnapshot, laadAlles, onWijziging])

  /** Zet het opslagpercentage van de hele selectie. `undefined` betekent: geen eigen
   *  opslag meer, dus terug naar de standaard-opslag van de calculatie. */
  const handleZetOpslagGeselecteerd = useCallback((pct: number | undefined) => {
    if (readOnly || geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      slaCalculatieregelOp({ ...r, opslag_pct: pct })
      // Een eigen opslag per component wint van die van de regel; zonder deze wis
      // zou er niets veranderen aan regels waar per component een opslag staat.
      componenten
        .filter(c => c.calculatieregel_id === id && c.opslag_pct !== undefined)
        .forEach(c => slaComponentregelOp({ ...c, opslag_pct: undefined }))
    })
    laadAlles(); onWijziging()
    setOpslagModalOpen(false)
    const aantal = `${ids.length} regel${ids.length !== 1 ? 's' : ''}`
    toast.success(pct === undefined
      ? `${aantal} terug op de standaard-opslag`
      : `Opslag ${formatGetal(pct, 2)}% op ${aantal}`)
  }, [readOnly, geselecteerdeRegels, regels, componenten, duwSnapshot, laadAlles, onWijziging])

  /** Zet het BTW-tarief van de hele selectie. Een lege keuze wist het tarief. */
  const handleZetBtwGeselecteerd = useCallback((tariefId: string) => {
    if (readOnly || geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const patch = kiesBtwTarief(btwTarieven, tariefId)
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      slaCalculatieregelOp({ ...r, ...patch })
    })
    laadAlles(); onWijziging()
    setBtwModalOpen(false)
    const gekozen = vindTarief(btwTarieven, patch.btw_tarief_id, patch.btw_pct)
    toast.success(`${gekozen ? tariefKort(gekozen) : 'Geen BTW'} op ${ids.length} regel${ids.length !== 1 ? 's' : ''}`)
  }, [readOnly, geselecteerdeRegels, regels, btwTarieven, duwSnapshot, laadAlles, onWijziging])

  /** Opent het opslagvenster met het huidige percentage als de selectie er één deelt. */
  const opentOpslagModal = useCallback(() => {
    const waarden = new Set(
      Array.from(geselecteerdeRegels).map(id => regels.find(r => r.id === id)?.opslag_pct),
    )
    const enige = waarden.size === 1 ? Array.from(waarden)[0] : undefined
    setOpslagInvoer(enige === undefined ? '' : String(+enige.toFixed(2)))
    setOpslagModalOpen(true)
  }, [geselecteerdeRegels, regels])

  // ─── Kolom resize ───────────────────────────────────────────────────────────
  const startResize = (col: ColId, e: React.MouseEvent) => {
    const startX = e.clientX
    const startW = colWidths[col]
    resizeRef.current = { col, startX, startW }
    const onMove = (me: MouseEvent) => {
      if (!resizeRef.current) return
      const newW = Math.max(COL_MAP[col].minW, startW + me.clientX - startX)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Kolom drag reorder ────────────────────────────────────────────────────
  const onColDragStart = (col: ColId) => setDragCol(col)
  const onColDragOver  = (e: React.DragEvent, col: ColId) => {
    e.preventDefault()
    if (dragCol && dragCol !== col) setDragOverCol(col)
  }
  const onColDrop = (col: ColId) => {
    if (!dragCol || dragCol === col) { setDragCol(null); setDragOverCol(null); return }
    setColOrder(prev => {
      const next = [...prev]
      const fi = next.indexOf(dragCol); const ti = next.indexOf(col)
      next.splice(fi, 1); next.splice(ti, 0, dragCol)
      return next
    })
    setDragCol(null); setDragOverCol(null)
  }
  const onColDragEnd = () => { setDragCol(null); setDragOverCol(null) }

  // ─── Regel drag & drop ─────────────────────────────────────────────────────
  const handleRegelDragStartGrid = useCallback((id: string) => {
    setSleepRegelId(id)
    // Sleep je een regel uit een bestaande selectie, dan gaat de hele selectie mee.
    setSleepRegelIds(
      geselecteerdeRegels.has(id) && geselecteerdeRegels.size > 1
        ? new Set(geselecteerdeRegels)
        : new Set([id]),
    )
  }, [geselecteerdeRegels])

  const handleDragEnd = useCallback(() => {
    setSleepRegelId(null); setSleepRegelIds(new Set()); setDragOverId(null)
  }, [])

  /** Volgorde waarin de groepen in het rekenblad staan — bepaalt de leesvolgorde
   *  waarin meerdere gesleepte regels bij elkaar worden gezet. */
  const groepVolgordeIndex = useMemo(() => {
    const map = new Map<string, number>()
    let i = 0
    const loop = (parentId: string | null) => {
      groepen.filter(g => g.parent_id === parentId).sort((a, b) => a.volgorde - b.volgorde)
        .forEach(g => { map.set(g.id, i++); loop(g.id) })
    }
    loop(null)
    return map
  }, [groepen])

  const handleVerplaatsRegelsNaarPositie = useCallback((
    regelIds: string[], doelGroepId: string, voorRegelId: string | null,
  ) => {
    const ids = new Set(regelIds)
    if (voorRegelId && ids.has(voorRegelId)) return   // droppen op jezelf
    const teVerplaatsen = regels
      .filter(r => ids.has(r.id))
      .sort((a, b) =>
        (groepVolgordeIndex.get(a.groep_id) ?? 0) - (groepVolgordeIndex.get(b.groep_id) ?? 0)
        || a.volgorde - b.volgorde)
    if (teVerplaatsen.length === 0) return
    duwSnapshot()

    // Doelgroep opnieuw opbouwen: bestaande regels zonder de gesleepte, dan invoegen
    const doelRegels = regels
      .filter(r => r.groep_id === doelGroepId && !ids.has(r.id))
      .sort((a, b) => a.volgorde - b.volgorde)
    const invoegenIdx = voorRegelId
      ? Math.max(0, doelRegels.findIndex(r => r.id === voorRegelId))
      : doelRegels.length
    doelRegels.splice(invoegenIdx, 0, ...teVerplaatsen.map(r => ({ ...r, groep_id: doelGroepId })))
    doelRegels.forEach((r, i) => slaCalculatieregelOp({ ...r, volgorde: i + 1 }))

    // Brongroepen dichttrekken en de meetstaat-koppeling meeverhuizen
    const bronGroepen = new Set(teVerplaatsen.map(r => r.groep_id).filter(gid => gid !== doelGroepId))
    bronGroepen.forEach(gid => {
      regels.filter(r => r.groep_id === gid && !ids.has(r.id))
        .sort((a, b) => a.volgorde - b.volgorde)
        .forEach((r, i) => slaCalculatieregelOp({ ...r, volgorde: i + 1 }))
    })
    teVerplaatsen.forEach(r => { if (r.groep_id !== doelGroepId) syncAggregaatGroep(r.id, doelGroepId) })

    setSleepRegelId(null); setSleepRegelIds(new Set()); setDragOverId(null)
    laadAlles(); onWijziging()
    const n = teVerplaatsen.length
    toast.success(`${n} regel${n !== 1 ? 's' : ''} verplaatst`)
  }, [regels, groepVolgordeIndex, duwSnapshot, laadAlles, onWijziging, syncAggregaatGroep])

  /** Een régel boven een groepskop: die groep licht op als doel. */
  const handleDragOver = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (sleepRegelId) setDragOverId(doel.id)
  }, [sleepRegelId])

  /** Drop op een groepskop → de regels achteraan die groep plaatsen. */
  const handleDrop = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (sleepRegelIds.size > 0) handleVerplaatsRegelsNaarPositie([...sleepRegelIds], doel.id, null)
  }, [sleepRegelIds, handleVerplaatsRegelsNaarPositie])

  // ─── Mutaties ──────────────────────────────────────────────────────────────
  const handleRegelWijzig = useCallback((id: string, veld: Partial<Calculatieregel>) => {
    setRegels(prev => {
      const bijgewerkt = prev.map(r => r.id === id ? { ...r, ...veld } : r)
      const r = bijgewerkt.find(r => r.id === id)
      if (r) slaCalculatieregelOp(r)
      return bijgewerkt
    })
    onWijziging()
  }, [onWijziging])

  const handleComponentWijzig = useCallback((
    regelId: string, type: Componentregel['type'], norm: number, tarief: number
  ) => {
    upsertComponentregel(regelId, type, norm, tarief)
    const groepIds = new Set(groepen.map(g => g.id))
    const rs = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds = new Set(rs.map(r => r.id))
    setComponenten(getComponentregels().filter(c => regelIds.has(c.calculatieregel_id)))
    onWijziging()
  }, [groepen, onWijziging])

  const handleVerwijderRegel = useCallback((id: string) => {
    duwSnapshot()
    verwijderCalculatieregel(id)
    setRegels(prev => prev.filter(r => r.id !== id))
    setComponenten(prev => prev.filter(c => c.calculatieregel_id !== id))
    onWijziging(); toast.success('Regel verwijderd')
  }, [duwSnapshot, onWijziging])

  const handleVerwijderGroep = useCallback((id: string) => {
    duwSnapshot()
    verwijderGroep(id); laadAlles(); onWijziging(); toast.success('Groep verwijderd')
  }, [duwSnapshot, laadAlles, onWijziging])

  const handleWijzigGroep = useCallback((id: string, patch: Partial<Groep>) => {
    const groep = groepen.find(g => g.id === id)
    if (!groep) return
    const bijgewerkt = { ...groep, ...patch }
    slaGroepOp(bijgewerkt)
    setGroepen(prev => prev.map(g => g.id === id ? bijgewerkt : g))
    onWijziging()
  }, [groepen, onWijziging])

  const handleWijzigComponentExtra = useCallback((compId: string, patch: Partial<Componentregel>) => {
    const comp = componenten.find(c => c.id === compId)
    if (!comp) return
    const bijgewerkt = { ...comp, ...patch }
    slaComponentregelOp(bijgewerkt)
    setComponenten(prev => prev.map(c => c.id === compId ? bijgewerkt : c))
  }, [componenten])

  const handleVoegComponentToe = useCallback((regelId: string, type: Componentregel['type']) => {
    const nieuw = voegComponentregelToe(regelId, type)
    // Vul standaard uurtarief in bij arbeid als het is ingesteld
    if (type === 'arbeid' && scenario.standaard_uurtarief && scenario.standaard_uurtarief > 0) {
      nieuw.tarief = scenario.standaard_uurtarief
      slaComponentregelOp(nieuw)
    }
    setComponenten(prev => [...prev, nieuw])
    onWijziging()
  }, [onWijziging, scenario.standaard_uurtarief])

  const handleVerwijderComponent = useCallback((compId: string) => {
    verwijderComponentregel(compId)
    setComponenten(prev => prev.filter(c => c.id !== compId))
    onWijziging()
  }, [onWijziging])

  const handleVoegRegelToe = useCallback((groepId: string) => {
    duwSnapshot()
    const volgorde = regels.filter(r => r.groep_id === groepId).length + 1
    const standaardBtw = scenario.btw_tarief_id_default
      ? kiesBtwTarief(btwTarieven, scenario.btw_tarief_id_default)
      : { btw_pct: scenario.btw_pct_default ?? undefined }
    const nieuw: Calculatieregel = {
      id: nieuweId(), groep_id: groepId, omschrijving: '', hoeveelheid: 1, eenheid: 'st', volgorde,
      ...standaardBtw,
    }
    slaCalculatieregelOp(nieuw)
    setRegels(prev => [...prev, nieuw])
    onWijziging()
  }, [duwSnapshot, regels, onWijziging, scenario, btwTarieven])

  /**
   * Tekstregel: alleen woorden. Bewust zonder BTW-tarief en met hoeveelheid 0 —
   * hij hoort nergens in mee te tellen, en zo kan hij dat ook niet per ongeluk
   * gaan doen als er ooit toch een bedrag aan zou hangen.
   */
  const handleVoegTekstregelToe = useCallback((groepId: string) => {
    duwSnapshot()
    const volgorde = regels.filter(r => r.groep_id === groepId).length + 1
    const nieuw: Calculatieregel = {
      id: nieuweId(), groep_id: groepId, omschrijving: '', hoeveelheid: 0, eenheid: 'st', volgorde,
      soort: 'tekst',
    }
    slaCalculatieregelOp(nieuw)
    setRegels(prev => [...prev, nieuw])
    onWijziging()
  }, [duwSnapshot, regels, onWijziging])

  const handleVoegSubgroepToe = useCallback((parent: Groep) => {
    setNieuwGroepParent(parent); setNieuwGroepNaam('')
  }, [])

  const bevestigSubgroep = () => {
    if (!nieuwGroepParent || !nieuwGroepNaam.trim()) return
    const nieuw: Groep = {
      id: nieuweId(), scenario_id: scenarioId,
      parent_id: nieuwGroepParent.id,
      naam: nieuwGroepNaam.trim(),
      niveau: (nieuwGroepParent.niveau + 1) as 1 | 2 | 3,
      volgorde: groepen.filter(g => g.parent_id === nieuwGroepParent.id).length + 1,
    }
    slaGroepOp(nieuw); laadAlles(); onWijziging()
    setNieuwGroepParent(null); setNieuwGroepNaam('')
  }

  const voegRootGroepToe = () => {
    setNieuwRootGroepNaam(''); setNieuwRootGroepOpen(true)
  }

  const bevestigRootGroep = () => {
    if (!nieuwRootGroepNaam.trim()) return
    const nieuw: Groep = {
      id: nieuweId(), scenario_id: scenarioId, parent_id: null,
      naam: nieuwRootGroepNaam.trim(), niveau: 1,
      volgorde: groepen.filter(g => g.parent_id === null).length + 1,
    }
    slaGroepOp(nieuw); laadAlles(); onWijziging()
    setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('')
  }

  // Optionele groepen niet meerekenen in eindtotaal
  const optioneleIds = new Set(
    groepen.filter(g => {
      // Een groep is optioneel als hijzelf optioneel is, of als een ancestor optioneel is
      let current: Groep | undefined = g
      while (current) {
        if (current.optioneel) return true
        current = groepen.find(p => p.id === current!.parent_id)
      }
      return false
    }).map(g => g.id)
  )
  const groepenZonderOptioneel = groepen.filter(g => !optioneleIds.has(g.id))
  const totaalKP    = berekenScenarioKostprijs(groepenZonderOptioneel, regels, componenten)
  const totaalVP    = berekenScenarioVP(groepenZonderOptioneel, regels, componenten, defaultOpslag)
  const totaalUren  = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepUren(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const totaalMT    = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepMaterieel(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const totaalOA    = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepOA(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const roots    = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)
  const visibleColOrder = colOrder.filter(id => !hiddenCols.has(id))
  const totalW   = visibleColOrder.reduce((s, id) => s + colWidths[id], 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

      {/* Sub-header: selectie-acties (alleen zichtbaar bij actieve selectie) */}
      {geselecteerdeRegels.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-everts">{geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} geselecteerd</span>
          <span className="text-slate-300 text-xs">·</span>
          <button
            onClick={handleKopieerRegels}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Kopieer geselecteerde regels (Ctrl+D)"
          >
            <CopyPlus className="w-3 h-3" /> Kopiëren
          </button>
          <button
            onClick={() => setVerplaatsModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Verplaats naar andere groep (Ctrl+M)"
          >
            <Move className="w-3 h-3" /> Verplaatsen
          </button>
          <button
            onClick={opentOpslagModal}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Opslag% van de geselecteerde regels wijzigen"
          >
            <Percent className="w-3 h-3" /> Opslag%
          </button>
          <button
            onClick={() => setBtwModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="BTW-tarief van de geselecteerde regels wijzigen"
          >
            <Receipt className="w-3 h-3" /> BTW
          </button>
          <button
            onClick={handleVerwijderGeselecteerd}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            title="Verwijder geselecteerde regels (Delete)"
          >
            <Trash2 className="w-3 h-3" /> Verwijderen
          </button>
          <button
            onClick={() => setGeselecteerdeRegels(new Set())}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-400 hover:text-slate-600"
            title="Deselecteer (Escape)"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Root-groep inline dialog */}
      {nieuwRootGroepOpen && (
        <div className="px-4 py-2.5 bg-everts-dark border-b border-everts/30 flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-medium text-white/80 whitespace-nowrap">Nieuwe hoofdgroep:</span>
          <input
            autoFocus
            value={nieuwRootGroepNaam}
            onChange={e => setNieuwRootGroepNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') bevestigRootGroep(); if (e.key === 'Escape') { setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('') } }}
            placeholder="Naam van de groep..."
            className="flex-1 text-xs px-3 py-1.5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 bg-paper/10 text-white placeholder-white/40"
          />
          <button
            onClick={bevestigRootGroep}
            disabled={!nieuwRootGroepNaam.trim()}
            className="text-xs bg-white text-everts-dark font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Toevoegen
          </button>
          <button
            onClick={() => { setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('') }}
            className="text-xs text-white/50 hover:text-white/80 px-1 transition-colors"
          >
            Annuleer
          </button>
        </div>
      )}

      {/* Subgroep inline form */}
      {nieuwGroepParent && (
        <div className="px-4 py-2 bg-everts-50 border-b border-everts/20 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-600">
            Subgroep onder <strong>{nieuwGroepParent.naam}</strong>:
          </span>
          <input
            autoFocus
            value={nieuwGroepNaam}
            onChange={e => setNieuwGroepNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') bevestigSubgroep(); if (e.key === 'Escape') setNieuwGroepParent(null) }}
            placeholder="Naam subgroep..."
            className="flex-1 text-xs px-2 py-1 border border-everts/40 rounded focus:outline-none focus:ring-1 focus:ring-everts bg-white"
          />
          <button onClick={bevestigSubgroep} className="text-xs bg-everts text-white px-2 py-1 rounded hover:bg-everts-dark">✓</button>
          <button onClick={() => setNieuwGroepParent(null)} className="text-xs text-slate-400 px-1 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Datalist voor kostengroep autocomplete */}
      <datalist id="kg-suggestions">
        {[...new Set(regels.map(r => r.kostengroep).filter((kg): kg is string => Boolean(kg)))].map(kg => (
          <option key={kg} value={kg} />
        ))}
      </datalist>

      {/* Kolom hover CSS */}
      <style>{visibleColOrder.map(id =>
        `#calc-tabel[data-hcol="${id}"] [data-col="${id}"] { background-color: rgba(219,234,254,0.35) !important; }`
      ).join(' ')}</style>

      {/* Kolom-layouts + kolommen-picker: gerenderd in de actiebalk (naast "Opties")
          via een portal in #calc-grid-toolbar-slot. */}
      {toolbarSlot && createPortal(
        <>
        {userId && (
          <div ref={layoutMenuRef} className="relative">
            <button
              onClick={() => setLayoutMenuOpen(v => !v)}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                actiefLayoutId
                  ? 'border-everts/40 bg-everts-50 text-everts font-medium'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
              title="Kolom-layouts (per gebruiker)"
            >
              <ChevronDown className="w-3 h-3" />
              {actiefLayoutId ? (layouts.find(l => l.id === actiefLayoutId)?.naam ?? 'Layout') : 'Layouts'}
            </button>
            {layoutMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-[150] min-w-[240px]">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 mb-1">
                  Kolom-layouts
                </div>
                {layouts.length === 0 && (
                  <div className="px-3 py-1.5 text-xs text-slate-400">Nog geen opgeslagen layouts</div>
                )}
                {layouts.map(l => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-1 px-2 py-1 hover:bg-slate-50 ${actiefLayoutId === l.id ? 'bg-everts-50/60' : ''}`}
                  >
                    <button
                      onClick={() => { pasLayoutToe(l.kolommen, l.id); setLayoutMenuOpen(false) }}
                      className="flex-1 min-w-0 text-left text-xs text-slate-700 truncate px-1 py-0.5"
                      title="Layout toepassen"
                    >
                      {l.is_standaard && <span className="text-amber-500 mr-1">★</span>}
                      {l.naam}
                    </button>
                    {!l.is_standaard && (
                      <button
                        onClick={() => layoutStandaardZetten(l.id)}
                        className="flex-shrink-0 p-1 text-slate-300 hover:text-amber-500 rounded"
                        title="Als standaard instellen"
                      >★</button>
                    )}
                    <button
                      onClick={() => layoutVerwijderen(l.id)}
                      className="flex-shrink-0 p-1 text-slate-300 hover:text-red-500 rounded"
                      title="Layout verwijderen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  {actiefLayoutId && (
                    <button
                      onClick={layoutBijwerken}
                      className="w-full text-left px-3 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                    >
                      Actieve layout bijwerken
                    </button>
                  )}
                  <button
                    onClick={layoutOpslaanAlsNieuw}
                    className="w-full text-left px-3 py-1 text-xs text-everts hover:bg-everts-50 font-medium"
                  >
                    Huidige kolommen opslaan als nieuw…
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={colPickerRef} className="relative">
          <button
            onClick={() => setColPickerOpen(v => !v)}
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              hiddenCols.size > 0
                ? 'border-everts/40 bg-everts-50 text-everts font-medium'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
            title="Kolommen tonen/verbergen"
          >
            <ChevronDown className="w-3 h-3" />
            Kolommen{hiddenCols.size > 0 ? ` (${hiddenCols.size} verborgen)` : ''}
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-[150] w-[300px] max-h-[70vh] overflow-auto">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 mb-1">
                Kolommen tonen en hernoemen
              </div>
              {COL_DEFS.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.id)}
                    disabled={NON_HIDEABLE.includes(c.id)}
                    onChange={() => toggleHiddenCol(c.id)}
                    className="w-3.5 h-3.5 rounded accent-everts flex-shrink-0 disabled:opacity-30"
                    title={NON_HIDEABLE.includes(c.id) ? 'Deze kolom is altijd zichtbaar' : 'Kolom tonen/verbergen'}
                  />
                  <KolomNaamVeld
                    waarde={colNamen[c.id] ?? ''}
                    standaard={standaardKolomNaam(c.id)}
                    onCommit={naam => zetKolomNaam(c.id, naam)}
                  />
                </div>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <p className="px-3 py-1 text-[10px] text-slate-400 leading-snug">
                  Eigen kolomnamen gelden alleen voor jou. Leeg laten = standaardnaam.
                  Je kunt ook dubbelklikken op een kolomkop.
                </p>
                {hiddenCols.size > 0 && (
                  <button
                    onClick={() => setHiddenCols(new Set())}
                    className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  >
                    Alle kolommen tonen
                  </button>
                )}
                {Object.keys(colNamen).length > 0 && (
                  <button
                    onClick={() => { setColNamen({}); void bewaarKolomNamen({}) }}
                    className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  >
                    Kolomnamen herstellen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </>,
        toolbarSlot,
      )}

      {/* Bevroren: houd disabled velden goed leesbaar (geen UA-grijs) */}
      {readOnly && (
        <style>{`fieldset.calc-fs:disabled input, fieldset.calc-fs:disabled select, fieldset.calc-fs:disabled textarea {
          -webkit-text-fill-color: currentColor !important; opacity: 1 !important; cursor: default !important;
        }`}</style>
      )}

      {/* Tabel — bij een bevroren calculatie disablen we alle formuliervelden via
          <fieldset disabled>; in/uitklappen blijft werken (die knoppen zijn <span>). */}
      <fieldset
        disabled={readOnly}
        className="calc-fs flex-1 overflow-auto min-h-0 min-w-0 border-0 p-0 m-0"
      >
        {roots.length > 0 ? (
          <table
            id="calc-tabel"
            ref={tabelRef}
            className="border-collapse text-sm w-full"
            style={{ tableLayout: 'fixed', minWidth: `${totalW}px` }}
            onMouseOver={e => {
              const cell = (e.target as HTMLElement).closest('[data-col]')
              const col  = cell?.getAttribute('data-col')
              if (col && tabelRef.current) tabelRef.current.dataset.hcol = col
            }}
            onMouseLeave={() => { if (tabelRef.current) delete tabelRef.current.dataset.hcol }}
          >
            <colgroup>
              {visibleColOrder.map(id => <col key={id} style={{ width: colWidths[id] }} />)}
            </colgroup>
            <TabelHeader
              colOrder={visibleColOrder} colWidths={colWidths} kolomNamen={effectieveKolomNamen}
              onHernoem={zetKolomNaam}
              onStartResize={startResize} dragOverCol={dragOverCol}
              onColDragStart={onColDragStart} onColDragOver={onColDragOver}
              onColDrop={onColDrop} onColDragEnd={onColDragEnd}
            />
            <tbody>
              {roots.map(g => (
                <GroepSectie
                  key={g.id} groep={g} diepte={0}
                  alleGroepen={groepen} alleRegels={regels} alleComponenten={componenten}
                  nummers={nummers} isActief={actiefGroepId === g.id}
                  defaultOpslag={defaultOpslag} colOrder={visibleColOrder} btwTarieven={btwTarieven}
                  uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={laadAlles}
                  onKlik={onGroepActief}
                  onRegelWijzig={handleRegelWijzig}
                  onRegelComponentWijzig={handleComponentWijzig}
                  onWijzigComponentExtra={handleWijzigComponentExtra}
                  onVoegComponentToe={handleVoegComponentToe}
                  onVerwijderComponent={handleVerwijderComponent}
                  onVerwijderRegel={handleVerwijderRegel}
                  onVerwijderGroep={handleVerwijderGroep}
                  onWijzigGroep={handleWijzigGroep} onToggleInklap={handleToggleInklap}
                  onVoegRegelToe={handleVoegRegelToe}
                  onVoegTekstregelToe={handleVoegTekstregelToe}
                  onVoegSubgroepToe={handleVoegSubgroepToe}
                  dragOverGroepId={dragOverId} sleepRegelId={sleepRegelId} sleepRegelIds={sleepRegelIds}
                  onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd}
                  onRegelDragStartNaarGroep={handleRegelDragStartGrid}
                  onRegelDragEnd={handleDragEnd}
                  onRegelVerplaatsNaarPositie={handleVerplaatsRegelsNaarPositie}
                  bibliotheekItems={bibliotheekItems}
                  behandelingen={behandelingen}
                  geselecteerdeRegels={geselecteerdeRegels}
                  onSelecteerRegel={handleSelecteerRegel}
                  collapseSignal={collapseSignal}
                  readOnly={readOnly}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                {visibleColOrder.map(id => {
                  if (id === 'omschrijving') return (
                    <td key={id} className="px-3 py-3 text-sm font-bold text-slate-700">Totaal calculatie</td>
                  )
                  if (id === 'bedrag_mt') return (
                    <td key={id} className="px-3 py-3 text-right bg-red-50/40">
                      {totaalMT !== 0 && <span className=" text-sm font-bold text-red-700">{formatEuro(totaalMT)}</span>}
                    </td>
                  )
                  if (id === 'bedrag_oa') return (
                    <td key={id} className="px-3 py-3 text-right bg-purple-50/40">
                      {totaalOA !== 0 && <span className=" text-sm font-bold text-purple-700">{formatEuro(totaalOA)}</span>}
                    </td>
                  )
                  if (id === 'tot_uren') return (
                    <td key={id} className="px-3 py-3 text-right bg-blue-50/40">
                      {totaalUren !== 0 && <span className=" text-sm font-bold text-blue-700">{formatGetal(totaalUren, 2)}</span>}
                    </td>
                  )
                  if (id === 'tot_kp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50">
                      <span className=" text-base font-bold text-everts-dark">{formatEuro(totaalKP)}</span>
                    </td>
                  )
                  if (id === 'tot_vp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50/80">
                      <span className=" text-base font-bold text-everts">{formatEuro(totaalVP)}</span>
                    </td>
                  )
                  return <td key={id} />
                })}
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-24 text-center">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-slate-500 font-semibold mb-1">Nog geen groepen aangemaakt</p>
            <p className="text-slate-400 text-sm mb-5">Maak een groep aan om te beginnen.</p>
            <button
              onClick={voegRootGroepToe}
              className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Eerste groep aanmaken
            </button>
          </div>
        )}
      </fieldset>

      {/* ─── Verplaats naar groep modal ──────────────────────────────────── */}
      {verplaatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setVerplaatsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">Verplaats naar groep</h2>
              <button onClick={() => setVerplaatsModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">{geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} verplaatsen naar:</p>
            <div className="overflow-auto flex-1 space-y-1">
              {groepen.map(g => {
                const nummer = nummers.get(g.id) ?? ''
                const indent = (g.niveau - 1) * 12
                return (
                  <button
                    key={g.id}
                    onClick={() => handleVerplaatsNaarGroep(g.id)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-everts-50 hover:text-everts-dark transition-colors flex items-center gap-2"
                    style={{ paddingLeft: `${12 + indent}px` }}
                  >
                    {nummer && <span className=" text-slate-400 text-[10px]">{nummer}</span>}
                    <span className="truncate">{g.naam}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Opslag% van de selectie ──────────────────────────────────────── */}
      {opslagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpslagModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">Opslag% wijzigen</h2>
              <button onClick={() => setOpslagModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} krijgen dit opslagpercentage:
            </p>
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text" inputMode="decimal"
                value={opslagInvoer}
                placeholder={formatGetal(defaultOpslag, 2)}
                onChange={e => setOpslagInvoer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && opslagInvoer.trim() !== '') handleZetOpslagGeselecteerd(parseGetal(opslagInvoer))
                  if (e.key === 'Escape') setOpslagModalOpen(false)
                }}
                className="flex-1 text-sm text-right px-2 py-1.5 rounded-lg border border-slate-200 focus:border-everts/40 focus:ring-2 focus:ring-everts/20 focus:outline-none text-slate-700"
              />
              <span className="text-slate-400 text-xs">%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Een eigen opslag per component (arbeid, materieel, onderaanneming) wordt gewist.
            </p>
            <div className="flex items-center justify-between gap-2 mt-4">
              <button
                onClick={() => handleZetOpslagGeselecteerd(undefined)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Geen eigen opslag: volg de standaard van de calculatie"
              >
                Standaard ({formatGetal(defaultOpslag, 2)}%)
              </button>
              <button
                disabled={opslagInvoer.trim() === ''}
                onClick={() => handleZetOpslagGeselecteerd(parseGetal(opslagInvoer))}
                className="text-xs bg-everts hover:bg-everts-dark text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Toepassen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── BTW-tarief van de selectie ───────────────────────────────────── */}
      {btwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBtwModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">BTW-tarief wijzigen</h2>
              <button onClick={() => setBtwModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} op dit tarief zetten:
            </p>
            <div className="overflow-auto flex-1 space-y-1">
              {btwTarieven.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleZetBtwGeselecteerd(t.id)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-everts-50 hover:text-everts-dark transition-colors flex items-center gap-2"
                >
                  <span className="text-slate-400 text-[10px] w-10 shrink-0">{tariefKort(t)}</span>
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
              <button
                onClick={() => handleZetBtwGeselecteerd('')}
                className="w-full text-left text-xs px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              >
                — geen tarief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default CalculatieGrid
