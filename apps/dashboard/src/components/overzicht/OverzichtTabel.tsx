'use client'

import React, { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnOrderState,
  type RowSelectionState,
  type PaginationState,
  type ColumnSizingState,
  type ExpandedState,
  type FilterFn,
} from '@tanstack/react-table'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { KolomConfig, GebruikerLayout, TabelWerkstand } from '@everts/database/platform-types'
import { slaLayoutOp, verwijderLayout, stelStandaardIn } from '@/app/actions/layouts'
import { laadWerkstand, bewaarWerkstand } from '@/app/actions/werkstand'
import {
  type KolomBasis, type TabelStand,
  standaardStand, standUitLayout, standUitWerkstand, werkstandUitStand,
  lokaleSleutel, leesLokaal, schrijfLokaal,
  PAGINA_GROOTTES,
} from './werkstand'
import {
  GripVertical,
  Eye, EyeOff, X, Check, Layers, SlidersHorizontal, ChevronDown as ChevronDownSm,
  Search, ChevronLeft, ChevronRight, MoreHorizontal, Download,
  ChevronsUpDown, ChevronsDownUp, RotateCcw,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type KolomDefinitie<T> = {
  key:                 string
  label:               string
  standaard_zichtbaar?: boolean
  vast?:               boolean
  render:              (item: T) => React.ReactNode
  sorteerWaarde?:      (item: T) => string | number | null
  filterType?:         'tekst' | 'select'
  filterOpties?:       string[]
  /**
   * Waarde waarop het select-filter matcht. Moet exact een van `filterOpties`
   * teruggeven — dus het getoonde label, niet de onderliggende sleutel.
   *
   * Nodig zodra `sorteerWaarde` iets anders teruggeeft dan wat de cel toont
   * (een volgorde-index, een enum-sleutel, een aantal dagen). Zonder deze
   * functie filtert de tabel op `sorteerWaarde` en vergelijkt hij bv. "0" met
   * "Verzonden" — dan valt de lijst leeg zodra je iets aanvinkt.
   *
   * Een array betekent dat de rij meerdere waarden heeft (bv. een relatie die
   * zowel leverancier als onderaannemer is); de rij blijft staan zodra één
   * daarvan is aangevinkt.
   */
  filterWaarde?:       (item: T) => string | string[] | null
  breedte?:            number
}

type Props<T extends { id: string }> = {
  scherm:     string
  data:       T[]
  kolommen:   KolomDefinitie<T>[]
  layouts:    GebruikerLayout[]
  user_id:    string | null
  onRijKlik?: (item: T) => void
  /** Toon de selectie-checkboxkolom (default true). */
  selecteerbaar?: boolean
  /** Buttons rendered in the toolbar right area (Filter, Export, Nieuw…) */
  acties?:    React.ReactNode
  /** Begin-sortering (kolom-key + richting); de gebruiker kan daarna vrij sorteren. */
  beginSortering?: SortingState
  /** Compacte rij-dichtheid (minder verticaal padding) — opt-in voor data-dichte schermen. */
  dicht?: boolean
  /** Toon de per-rij actieknop (⋯) rechts (default true). Rijen blijven klikbaar zonder de knop. */
  toonRijActie?: boolean
  /**
   * Optioneel: rijen bundelen onder in-/uitklapbare groepsregels. Weglaten = platte tabel.
   * De groepeerkolom is intern en verschijnt niet in het kolombeheer of de export.
   */
  groepering?: {
    /** Waarde waarop gebundeld wordt, bv. `r => r.dossier_id`. */
    sleutel: (item: T) => string
    /** Inhoud van de groepsregel; krijgt alle rijen van de groep (na filteren). */
    kop: (rijen: T[], sleutel: string) => React.ReactNode
    /** Begin uitgeklapt (default false = ingeklapt). */
    standaardOpen?: boolean
  }
  /** Tekst op één regel houden: te lange celinhoud wordt afgekapt met een ellipsis. */
  eenregelig?: boolean
  /**
   * Optioneel: krijg de rijen terug die door de zoekbalk en de kolomfilters heen
   * komen, zodat totalen buiten de tabel (tel-kaarten, subtotaalbalken) met die
   * filters meebewegen in plaats van over de hele dataset te rekenen.
   *
   * De rijen zijn ongegroepeerd en ongepagineerd — je krijgt dus álles wat het
   * filter overleeft, niet alleen de zichtbare pagina.
   */
  onGefilterd?: (rijen: T[]) => void
  /**
   * Optioneel: regels die ná de gegevens onder aan het Excel-bestand komen,
   * gescheiden door een lege regel. Bedoeld voor totalen en omrekeningen die je
   * niet per rij kunt uitdrukken.
   *
   * Krijgt dezelfde rijen als `onGefilterd`, dus het totaal in het bestand hoort
   * bij de filters die op dat moment aan staan.
   */
  exportExtraRijen?: (rijen: T[]) => (string | number)[][]
  /**
   * Optioneel: vaste afvink-kolom links (buiten het kolombeheer en de layouts om).
   * 'open' = leeg rondje (klikbaar), 'af' = groen vinkje (klikbaar), 'verborgen' = lege cel.
   */
  afvinkKolom?: {
    status: (item: T) => 'open' | 'af' | 'verborgen'
    onKlik: (item: T) => void
    /** Bezig-indicator: rij-id waarvoor een wijziging loopt (knop tijdelijk uit). */
    bezigId?: string | null
  }
}

/** Interne kolom-id waarop gegroepeerd wordt; altijd verborgen. */
const GROEP_KOLOM = '__groep'

/**
 * Stabiele referentie voor de grouping-state. Een array-literal in `state` geeft
 * TanStack elke render een nieuwe referentie → grouped row model herbouwt →
 * async resetExpanded in de wachtrij → oneindige update-lus (bevroren tab).
 */
const GROEP_GROUPING = [GROEP_KOLOM]

/**
 * `useLayoutEffect` waar dat kan, `useEffect` op de server. De bewaarde werkstand
 * toepassen vóór de eerste schildering voorkomt dat de standaardkolommen even
 * zichtbaar zijn; op de server draaien effecten toch niet en zou React waarschuwen.
 */
const useLayoutEffectVeilig = typeof window !== 'undefined' ? React.useLayoutEffect : useEffect

// ─── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate, onChange, disabled }: {
  checked: boolean
  indeterminate?: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange?.(!checked) }}
      style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--border)'}`,
        background: checked || indeterminate ? 'var(--accent)' : 'white',
        display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 100ms, border-color 100ms',
      }}
    >
      {indeterminate
        ? <span style={{ width: 7, height: 1.5, background: 'white', borderRadius: 1, display: 'block' }} />
        : checked
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : null
      }
    </div>
  )
}

// ─── Draggable header cell ────────────────────────────────────────────────────

function DraggableHeaderCell({
  columnId, children, style,
}: {
  columnId: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnId })
  return (
    <th
      ref={setNodeRef}
      style={{ ...style, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      className="overzicht-th"
    >
      <span
        {...listeners}
        className="th-grip"
        style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', marginRight: 4, color: 'var(--fg-muted)', opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={11} />
      </span>
      {children}
    </th>
  )
}

// ─── Sort icon (DS §43 style) ─────────────────────────────────────────────────

function SortIco({ dir }: { dir: false | 'asc' | 'desc' }) {
  if (dir === 'asc') return <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 3 }}>▲</span>
  if (dir === 'desc') return <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 3 }}>▼</span>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 3, opacity: 0.35, verticalAlign: 'middle' }}>
      <span style={{ fontSize: 7, lineHeight: 1 }}>▲</span>
      <span style={{ fontSize: 7, lineHeight: 1 }}>▼</span>
    </span>
  )
}

// ─── Multiselect kolomfilter ──────────────────────────────────────────────────

/**
 * Filterwaarde is een array van gekozen opties; lege array of undefined = geen filter.
 *
 * Er wordt vergeleken met `kolom.filterWaarde`, en alleen als die ontbreekt met
 * de accessor-waarde (= `sorteerWaarde`). Sorteren en filteren hebben namelijk
 * niet dezelfde waarde nodig: een statuskolom sorteert op procesvolgorde maar
 * moet op zijn label filteren.
 */
function maakInLijstFilter<T>(kolom: KolomDefinitie<T>): FilterFn<T> {
  return (row, columnId, filterValue) => {
    const gekozen = filterValue as string[]
    if (!Array.isArray(gekozen) || gekozen.length === 0) return true
    const ruw = kolom.filterWaarde ? kolom.filterWaarde(row.original) : row.getValue(columnId)
    const waarden = Array.isArray(ruw) ? ruw : [String(ruw ?? '')]
    return waarden.some(w => gekozen.includes(w))
  }
}

function MultiSelectFilter({
  opties, value, onChange,
}: {
  opties: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    // Popover staat position:fixed — bij scrollen sluiten zodat hij niet loskomt van de knop.
    function onScroll(e: Event) {
      if (popRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 170) })
    }
    setOpen(o => !o)
  }

  function toggleOptie(o: string) {
    onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o])
  }

  const label = value.length === 0 ? 'Alle' : value.length === 1 ? value[0] : `${value.length} geselecteerd`

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); toggleOpen() }}
        className="eva-input"
        style={{
          width: '100%', fontSize: 11, padding: '3px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          cursor: 'pointer', textAlign: 'left',
          color: value.length > 0 ? 'var(--fg)' : 'var(--fg-muted)',
          fontWeight: value.length > 0 ? 600 : 400,
          textTransform: 'none', letterSpacing: 'normal',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDownSm size={11} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--fg-muted)' }} />
      </button>

      {open && pos && (
        <div
          ref={popRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 400,
            background: 'white', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '4px 0',
            maxHeight: 260, overflowY: 'auto',
          }}
        >
          {opties.map(o => {
            const checked = value.includes(o)
            return (
              <label
                key={o}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg)',
                  textTransform: 'none', letterSpacing: 'normal', fontWeight: checked ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleOptie(o)} style={{ display: 'none' }} />
                <Checkbox checked={checked} onChange={() => toggleOptie(o)} />
                {o}
              </label>
            )
          })}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', border: 'none', borderTop: '1px solid var(--border-soft)',
                background: 'none', cursor: 'pointer', padding: '6px 12px', marginTop: 2,
                fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--fg-muted)',
              }}
            >
              Wis filter
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OverzichtTabel<T extends { id: string }>({
  scherm, data, kolommen, layouts: initialLayouts, user_id, onRijKlik, selecteerbaar = true, acties, beginSortering, dicht = false, toonRijActie = true, groepering, eenregelig = false, afvinkKolom, onGefilterd, exportExtraRijen,
}: Props<T>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Werkstand: kolommen, sortering, filters en zoekterm overleven het scherm ──
  // Wisselen naar kanban unmount deze tabel; zonder deze laag begon je daarna weer
  // met de standaardkolommen. Zie ./werkstand.ts voor opslag en reconciliatie.

  // Alleen de velden die de werkstand nodig heeft, gememoïseerd op hun inhoud: de
  // `kolommen`-prop is bij de meeste aanroepers een verse array per render.
  const kolomHandtekening = kolommen
    .map(k => `${k.key}:${k.standaard_zichtbaar === false ? 0 : 1}:${k.vast ? 1 : 0}:${k.filterType ?? ''}:${k.breedte ?? ''}`)
    .join('|')
  const kolomBasis = React.useMemo<KolomBasis[]>(
    () => kolommen.map(k => ({
      key: k.key, standaard_zichtbaar: k.standaard_zichtbaar,
      vast: k.vast, filterType: k.filterType, breedte: k.breedte,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kolomHandtekening],
  )
  const kolomBasisRef = useRef(kolomBasis)
  kolomBasisRef.current = kolomBasis

  const werkstandSleutel = lokaleSleutel(user_id, scherm)

  /**
   * De stand voor de eerste render. Bewust *zonder* localStorage: dit component wordt
   * ook op de server gerenderd, en daar bestaat die opslag niet — een andere uitkomst
   * op de server dan in de browser geeft een hydratiefout. De bewaarde werkstand komt
   * er meteen na hydratie overheen (zie de layout-effecten hieronder).
   */
  const beginStand = React.useMemo<{ stand: TabelStand; layout_id: string | null }>(() => {
    const basis = standaardStand(kolomBasis, beginSortering)
    const standaardLayout = initialLayouts.find(l => l.is_standaard)
    return standaardLayout
      ? { stand: standUitLayout(standaardLayout.kolommen, kolomBasis, basis), layout_id: standaardLayout.id }
      : { stand: basis, layout_id: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(beginStand.stand.columnVisibility)
  const [columnOrder, setColumnOrder]           = useState<ColumnOrderState>(beginStand.stand.columnOrder)
  const [columnSizing, setColumnSizing]         = useState<ColumnSizingState>(beginStand.stand.columnSizing)
  const [sorting, setSorting]                   = useState<SortingState>(beginStand.stand.sorting)
  const [columnFilters, setColumnFilters]       = useState<ColumnFiltersState>(beginStand.stand.columnFilters)
  const [globalFilter, setGlobalFilter]         = useState(beginStand.stand.globalFilter)
  const [rowSelection, setRowSelection]         = useState<RowSelectionState>({})
  const [pagination, setPagination]             = useState<PaginationState>({ pageIndex: 0, pageSize: beginStand.stand.pageSize })
  const [expanded, setExpanded]                 = useState<ExpandedState>(groepering?.standaardOpen ? true : {})

  const [layouts, setLayouts]             = useState<GebruikerLayout[]>(initialLayouts)
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(beginStand.layout_id)
  // Voor de hydratie-effecten, die maar één keer draaien en toch de actuele lijst nodig hebben.
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts
  const [showSaveAs, setShowSaveAs]     = useState(false)
  const [saveAsNaam, setSaveAsNaam]     = useState('')
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showKolomBeheer, setShowKolomBeheer] = useState(false)

  const layoutMenuRef  = useRef<HTMLDivElement>(null)
  const kolomBeheerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node))
        setShowLayoutMenu(false)
      if (kolomBeheerRef.current && !kolomBeheerRef.current.contains(e.target as Node))
        setShowKolomBeheer(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /** Alle bewaarde onderdelen in één keer zetten (hydratie, layoutkeuze, herstellen). */
  const zetStand = useCallback((s: TabelStand) => {
    setColumnOrder(s.columnOrder)
    setColumnVisibility(s.columnVisibility)
    setColumnSizing(s.columnSizing)
    setSorting(s.sorting)
    setColumnFilters(s.columnFilters)
    setGlobalFilter(s.globalFilter)
    setPagination(p => ({ ...p, pageIndex: 0, pageSize: s.pageSize }))
  }, [])

  const applyLayout = useCallback((layout: GebruikerLayout) => {
    const basis = standaardStand(kolomBasisRef.current, beginSortering)
    const stand = standUitLayout(layout.kolommen, kolomBasisRef.current, basis)
    // Een layout gaat alleen over kolommen: sortering, filters en zoekterm blijven staan.
    setColumnOrder(stand.columnOrder)
    setColumnVisibility(stand.columnVisibility)
    setColumnSizing(stand.columnSizing)
    setActiveLayoutId(layout.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Werkstand bewaren en terugzetten ───────────────────────────────────────
  // localStorage direct (goedkoop, en overleeft een unmount midden in een actie),
  // de server gedempt zodat slepen of typen geen stroom aan schrijfacties oplevert.
  const SERVER_VERTRAGING_MS = 1200
  const serverTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const laatsteStaat = useRef<TabelWerkstand | null>(null)

  /**
   * De stand die we het laatst hebben *ingelezen* of weggeschreven, zonder tijdstempel.
   * Dankzij deze vergelijking schrijft een zojuist gehydrateerde stand zichzelf niet
   * terug — anders zou elke keer openen de lokale tijdstempel opfrissen en zou een
   * nieuwere stand van een ander apparaat er nooit meer in komen.
   */
  const bekendeKern = useRef<string | null>(null)
  const kern = (staat: TabelWerkstand) => JSON.stringify({ ...staat, opgeslagen_op: '' })
  if (bekendeKern.current === null) {
    bekendeKern.current = kern(werkstandUitStand(beginStand.stand, beginStand.layout_id))
  }

  /**
   * Poort voor het opslaan. React draait de passieve effecten van de eerste render
   * ná het layout-effect dat de werkstand inleest — dat effect zou dus met de
   * standaardwaarden draaien en de zojuist ingelezen stand overschrijven. Als state
   * (geen ref) zodat het effect ná de hydratie opnieuw draait, met de juiste waarden.
   */
  const [gehydrateerd, setGehydrateerd] = useState(false)

  const schrijfNaarServer = useCallback(() => {
    if (!user_id || !laatsteStaat.current) return
    void bewaarWerkstand(user_id, scherm, laatsteStaat.current)
  }, [user_id, scherm])

  useEffect(() => {
    if (!gehydrateerd) return
    const staat = werkstandUitStand({
      columnOrder, columnVisibility, columnSizing, sorting,
      columnFilters, globalFilter, pageSize: pagination.pageSize,
    }, activeLayoutId)
    if (kern(staat) === bekendeKern.current) return   // niets nieuws t.o.v. wat er al ligt

    bekendeKern.current = kern(staat)
    laatsteStaat.current = staat
    schrijfLokaal(werkstandSleutel, staat)

    if (serverTimer.current) clearTimeout(serverTimer.current)
    serverTimer.current = setTimeout(schrijfNaarServer, SERVER_VERTRAGING_MS)
  }, [
    gehydrateerd, columnOrder, columnVisibility, columnSizing, sorting, columnFilters,
    globalFilter, pagination.pageSize, activeLayoutId, werkstandSleutel, schrijfNaarServer,
  ])

  // Doorschrijven bij unmount (kanban-wissel, navigeren) en zodra de tab naar de
  // achtergrond gaat — anders gaat de laatste wijziging binnen de demping verloren.
  useEffect(() => {
    function flush() {
      if (!serverTimer.current) return
      clearTimeout(serverTimer.current)
      serverTimer.current = null
      schrijfNaarServer()
    }
    function bijVerbergen() { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', bijVerbergen)
    return () => {
      document.removeEventListener('visibilitychange', bijVerbergen)
      flush()
    }
  }, [schrijfNaarServer])

  /** Een bewaarde werkstand toepassen zonder hem als nieuwe wijziging te tellen. */
  const pasWerkstandToe = useCallback((staat: TabelWerkstand): boolean => {
    const basis = standaardStand(kolomBasisRef.current, beginSortering)
    const stand = standUitWerkstand(staat, kolomBasisRef.current, basis)
    if (!stand) return false
    const layout_id = staat.layout_id && layoutsRef.current.some(l => l.id === staat.layout_id)
      ? staat.layout_id
      : null
    bekendeKern.current = kern(werkstandUitStand(stand, layout_id))
    zetStand(stand)
    setActiveLayoutId(layout_id)
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zetStand])

  // Lokale werkstand: vóór de eerste schildering na hydratie, zodat de standaard-
  // kolommen niet zichtbaar wegflitsen. Pas daarna gaat de opslag-poort open.
  useLayoutEffectVeilig(() => {
    const lokaal = leesLokaal(werkstandSleutel)
    if (lokaal) pasWerkstandToe(lokaal)
    setGehydrateerd(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Werkstand van een ander apparaat: alleen als hij nieuwer is dan wat hier ligt.
  // Elke wijziging van de gebruiker verfrist de lokale tijdstempel, dus deze controle
  // dekt ook het geval dat iemand al aan het filteren was toen het antwoord binnenkwam.
  useEffect(() => {
    if (!user_id) return
    let afgebroken = false
    void (async () => {
      const server = await laadWerkstand(user_id, scherm)
      if (afgebroken || !server?.opgeslagen_op) return
      const lokaal = leesLokaal(werkstandSleutel)
      if (lokaal?.opgeslagen_op && lokaal.opgeslagen_op >= server.opgeslagen_op) return
      if (pasWerkstandToe(server)) schrijfLokaal(werkstandSleutel, server)
    })()
    return () => { afgebroken = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Terug naar de standaardweergave (of naar de layout die als standaard staat). */
  function herstelWeergave() {
    const basis = standaardStand(kolomBasisRef.current, beginSortering)
    const standaardLayout = layouts.find(l => l.is_standaard)
    zetStand(standaardLayout
      ? standUitLayout(standaardLayout.kolommen, kolomBasisRef.current, basis)
      : basis)
    setActiveLayoutId(standaardLayout?.id ?? null)
    setShowKolomBeheer(false)
    toast.success('Weergave hersteld')
  }

  function handleVisibilityChange(key: string, value: boolean) {
    setColumnVisibility(prev => ({ ...prev, [key]: value }))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setColumnOrder(prev =>
      arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)),
    )
  }

  // ── Selection column ──────────────────────────────────────────────────────
  const selectColumn: ColumnDef<T> = {
    id: '__select',
    size: 40,
    enableSorting: false,
    enableColumnFilter: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler() as (v: boolean) => void}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler() as (v: boolean) => void}
      />
    ),
  }

  // ── Groepeerkolom (intern, altijd verborgen) ──────────────────────────────
  const groepColumn: ColumnDef<T> = {
    id: GROEP_KOLOM,
    accessorFn: (row: T) => (groepering ? groepering.sleutel(row) : ''),
    enableGrouping: true,
    enableSorting: false,
    enableColumnFilter: false,
  }

  const tableColumns: ColumnDef<T>[] = [
    selectColumn,
    ...(groepering ? [groepColumn] : []),
    ...kolommen.map(k => ({
      id: k.key,
      accessorFn: k.sorteerWaarde ?? ((row: T) => {
        const r = k.render(row)
        return (typeof r === 'string' || typeof r === 'number') ? r : ''
      }),
      header: k.label,
      cell: ({ row }: { row: { original: T } }) => k.render(row.original),
      // Groepsregels renderen we zelf; een aggregatiecel zou k.render(undefined) aanroepen.
      aggregatedCell: () => null,
      enableGrouping: false,
      enableSorting: !!k.sorteerWaarde,
      enableColumnFilter: !!k.filterType,
      enableResizing: true,
      filterFn: k.filterType === 'select' ? maakInLijstFilter(k) : ('includesString' as const),
      size: k.breedte ?? 150,
      minSize: 60,
    })),
  ]

  // Vangnet tegen een filter dat altijd leeg blijft: als geen enkele rij een
  // waarde heeft die in `filterOpties` voorkomt, klopt de koppeling tussen de
  // opties en de gefilterde waarde niet. Alleen tijdens ontwikkelen.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || data.length === 0) return
    for (const k of kolommen) {
      if (k.filterType !== 'select') continue
      if (!k.filterOpties?.length) {
        console.warn(`[OverzichtTabel:${scherm}] kolom "${k.key}" heeft filterType 'select' zonder filterOpties — de keuzelijst blijft leeg.`)
        continue
      }
      const steekproef = data.slice(0, 200)
      const raak = steekproef.some(rij => {
        const ruw = k.filterWaarde
          ? k.filterWaarde(rij)
          : k.sorteerWaarde
            ? k.sorteerWaarde(rij)
            : ''
        const waarden = Array.isArray(ruw) ? ruw : [String(ruw ?? '')]
        return waarden.some(w => k.filterOpties!.includes(w))
      })
      if (!raak) {
        console.warn(`[OverzichtTabel:${scherm}] kolom "${k.key}": geen enkele rij matcht een van de filterOpties — filteren levert altijd 0 rijen. Voeg een filterWaarde toe die het getoonde label teruggeeft.`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kolommen, data, scherm])

  // De groepeerkolom mag nooit als cel of in het kolombeheer opduiken.
  // Gememoized: een verse object-identiteit per render laat TanStack's interne
  // memo's elke render opnieuw rekenen.
  const heeftGroepering = !!groepering
  const effectieveVisibility = React.useMemo<VisibilityState>(
    () => (heeftGroepering ? { ...columnVisibility, [GROEP_KOLOM]: false } : columnVisibility),
    [columnVisibility, heeftGroepering],
  )

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting, columnFilters, columnVisibility: effectieveVisibility, columnOrder, columnSizing,
      globalFilter, rowSelection, pagination,
      ...(groepering ? { grouping: GROEP_GROUPING, expanded } : {}),
    },
    onExpandedChange: setExpanded,
    groupedColumnMode: false,
    // Uitklap-status is user-state: niet automatisch resetten bij data-/state-
    // wijzigingen (de async reset veroorzaakte bovendien de update-lus hierboven).
    autoResetExpanded: false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    ...(groepering ? { getGroupedRowModel: getGroupedRowModel(), getExpandedRowModel: getExpandedRowModel() } : {}),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableRowSelection: true,
  })

  // ── Layout CRUD ────────────────────────────────────────────────────────────
  function currentKolommen(): KolomConfig[] {
    return columnOrder.map((key, i) => ({
      key,
      zichtbaar: columnVisibility[key] !== false,
      volgorde: i,
      breedte: columnSizing[key] ?? undefined,
    }))
  }

  function handleSaveAs() {
    if (!user_id || !saveAsNaam.trim()) return
    startTransition(async () => {
      const result = await slaLayoutOp(user_id, scherm, saveAsNaam.trim(), currentKolommen())
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => [...prev, {
        id: result.id!, user_id, scherm, naam: saveAsNaam.trim(),
        kolommen: currentKolommen(), is_standaard: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }])
      setActiveLayoutId(result.id!)
      setShowSaveAs(false); setSaveAsNaam('')
      toast.success('Layout opgeslagen')
    })
  }

  function handleUpdateLayout() {
    if (!user_id || !activeLayoutId) return
    startTransition(async () => {
      const layout = layouts.find(l => l.id === activeLayoutId)
      if (!layout) return
      const result = await slaLayoutOp(user_id, scherm, layout.naam, currentKolommen(), activeLayoutId)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, kolommen: currentKolommen() } : l))
      toast.success('Layout bijgewerkt')
    })
  }

  function handleDeleteLayout(id: string) {
    if (!user_id) return
    startTransition(async () => {
      const result = await verwijderLayout(id, user_id)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.filter(l => l.id !== id))
      if (activeLayoutId === id) setActiveLayoutId(null)
      toast.success('Layout verwijderd')
    })
  }

  function handleSetStandaard(id: string) {
    if (!user_id) return
    startTransition(async () => {
      const result = await stelStandaardIn(id, user_id, scherm)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.map(l => ({ ...l, is_standaard: l.id === id })))
      toast.success('Standaard layout ingesteld')
    })
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const orderedKolommen = columnOrder
    .map(key => kolommen.find(k => k.key === key))
    .filter(Boolean) as KolomDefinitie<T>[]

  /** Aantal kolommen dat een groeps- of lege-staat-regel moet overspannen. */
  const kolomAantal =
    columnOrder.filter(k => columnVisibility[k] !== false).length
    + (selecteerbaar ? 1 : 0)
    + (afvinkKolom ? 1 : 0)
    + (toonRijActie ? 1 : 0)

  // ── Gefilterde rijen terugmelden ──────────────────────────────────────────
  // De callback in een ref, zodat een aanroeper die hem niet memoïseert geen
  // effect-lus veroorzaakt: het effect hangt alleen aan het rijmodel, en dat
  // herberekent TanStack pas als data of filters echt wijzigen.
  const onGefilterdRef = useRef(onGefilterd)
  onGefilterdRef.current = onGefilterd
  const gefilterdeRijen = table.getFilteredRowModel().rows
  useEffect(() => {
    onGefilterdRef.current?.(gefilterdeRijen.map(r => r.original))
  }, [gefilterdeRijen])

  const hasFilters = kolommen.some(k => k.filterType)
  const activeFilters = columnFilters.filter(f =>
    f.value !== '' && f.value !== undefined && f.value !== null
    && !(Array.isArray(f.value) && f.value.length === 0)
  )
  const hasActiveChips = activeFilters.length > 0 || globalFilter.length > 0
  const filteredCount  = table.getFilteredRowModel().rows.length
  const selectedCount  = table.getFilteredSelectedRowModel().rows.length
  const totalPages     = table.getPageCount()
  const pageIndex      = table.getState().pagination.pageIndex

  const activeLayoutNaam = activeLayoutId
    ? (layouts.find(l => l.id === activeLayoutId)?.naam ?? 'Layout')
    : 'Weergave'

  /**
   * Wijkt de kolomstand af van de gekozen layout? Afgeleid in plaats van bijgehouden:
   * de werkstand wordt nu automatisch bewaard, dus de tabel kán bij het openen al
   * afwijken van de layout — een handmatig gezette vlag zou dat missen.
   *
   * Vergelijken gebeurt tegen de layout zoals hij *nu* uitpakt, zodat een kolom die
   * later in de code is bijgekomen niet iedereen een valse wijzigingsstip geeft.
   */
  const isDirty = React.useMemo(() => {
    const layout = activeLayoutId ? layouts.find(l => l.id === activeLayoutId) : null
    if (!layout) return false
    const vanLayout = standUitLayout(layout.kolommen, kolomBasis, standaardStand(kolomBasis, beginSortering))
    if (vanLayout.columnOrder.join('|') !== columnOrder.join('|')) return true
    return columnOrder.some(key =>
      (vanLayout.columnVisibility[key] !== false) !== (columnVisibility[key] !== false)
      || (vanLayout.columnSizing[key] ?? null) !== (columnSizing[key] ?? null)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayoutId, layouts, kolomBasis, columnOrder, columnVisibility, columnSizing])

  // ── Excel Export ───────────────────────────────────────────────────────────
  async function exportNaarExcel() {
    const XLSX = await import('xlsx')
    const zichtbareKolommen = orderedKolommen.filter(k => columnVisibility[k.key] !== false)
    const headers = zichtbareKolommen.map(k => k.label)
    const rijen = table.getFilteredRowModel().rows.map(row =>
      zichtbareKolommen.map(k => {
        // filterWaarde geeft de getoonde tekst; sorteerWaarde mag een index of
        // sleutel zijn en zou dan als "0" of "regie" in het bestand belanden.
        if (k.filterWaarde) {
          const gefilterd = k.filterWaarde(row.original)
          return Array.isArray(gefilterd) ? gefilterd.join(', ') : (gefilterd ?? '')
        }
        const waarde = k.sorteerWaarde ? k.sorteerWaarde(row.original) : ''
        // Getallen als getal behouden zodat Excel ermee rekent; null → lege cel
        if (waarde == null) return ''
        if (typeof waarde === 'number' || typeof waarde === 'boolean') return waarde
        return String(waarde)
      })
    )

    // Totalen en omrekeningen onderaan, gescheiden door een lege regel zodat een
    // draaitabel of filter in Excel er niet overheen struikelt.
    const extra = exportExtraRijen
      ? exportExtraRijen(table.getFilteredRowModel().rows.map(r => r.original))
      : []
    const alleRijen = extra.length > 0 ? [...rijen, [], ...extra] : rijen

    const ws = XLSX.utils.aoa_to_sheet([headers, ...alleRijen])
    // Kolombreedte op basis van langste waarde per kolom
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(
        String(h).length,
        ...alleRijen.map(r => String(r[i] ?? '').length),
      )
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Export')
    XLSX.writeFile(wb, `${scherm}-export.xlsx`)
    toast.success(`${rijen.length} rijen geëxporteerd`)
  }

  // ── Styles — DS Data Display §43 ──────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: dicht ? '7px 12px' : '10px 14px', textAlign: 'left', userSelect: 'none', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)', background: 'var(--bg)',
  }

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
    padding: dicht ? '7px 12px' : '12px 14px', borderBottom: '1px solid var(--border-soft)',
    verticalAlign: 'middle',
    ...(eenregelig ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
  }

  // ── Pagination helpers ─────────────────────────────────────────────────────
  function PagBtn({ children, active, disabled, onClick }: {
    children: React.ReactNode, active?: boolean, disabled?: boolean, onClick?: () => void
  }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          height: 28, minWidth: 28, padding: '0 8px',
          border: '1px solid var(--border)', borderRadius: 5,
          background: active ? 'var(--accent)' : 'white',
          color: active ? 'white' : 'var(--fg)',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: active ? 600 : 400,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'grid', placeItems: 'center',
          opacity: disabled ? 0.4 : 1,
          transition: 'background 100ms',
        }}
        onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
        onMouseLeave={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'white' }}
      >
        {children}
      </button>
    )
  }

  function pageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i)
    const pages: (number | '…')[] = [0, 1, 2]
    if (pageIndex > 3) pages.push('…')
    if (pageIndex > 2 && pageIndex < totalPages - 3) pages.push(pageIndex)
    if (pageIndex < totalPages - 4) pages.push('…')
    pages.push(totalPages - 1)
    return [...new Set(pages)]
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Tabel-container ── */}
      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'white' }}>

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: 'white',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Zoekbalk (links) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 32, padding: '0 10px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, minWidth: 220, flex: 1, maxWidth: 360,
          }}>
            <Search size={13} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <input
              placeholder={`Zoek dossier, relatie…`}
              value={globalFilter}
              onChange={e => { setGlobalFilter(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
              style={{
                flex: 1, border: 0, outline: 'none',
                fontFamily: 'var(--font-ui)', fontSize: 12.5,
                background: 'transparent', color: 'var(--fg)',
              }}
            />
            {globalFilter && (
              <button onClick={() => setGlobalFilter('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--fg-muted)', display: 'flex' }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Count */}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
            {filteredCount} {scherm}
          </span>

          {/* Export knop (ingebouwd) */}
          <button
            onClick={exportNaarExcel}
            title="Exporteer als Excel"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 32, padding: '0 10px',
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--neutral-100, #f1f4f5)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
          >
            <Download size={13} strokeWidth={2} />
            Export
          </button>

          {/* Alles uit-/inklappen (alleen bij groepering) */}
          {groepering && (
            <button
              onClick={() => table.toggleAllRowsExpanded(!table.getIsAllRowsExpanded())}
              title={table.getIsAllRowsExpanded() ? 'Alles inklappen' : 'Alles uitklappen'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 32, padding: '0 10px',
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--bg)', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--neutral-100, #f1f4f5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
            >
              {table.getIsAllRowsExpanded()
                ? <><ChevronsDownUp size={13} strokeWidth={2} />Alles inklappen</>
                : <><ChevronsUpDown size={13} strokeWidth={2} />Alles uitklappen</>}
            </button>
          )}

          {/* Extern meegegeven acties (Nieuw…) */}
          {acties && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{acties}</div>}

          {/* Layout dropdown */}
          {user_id && (
            <div style={{ position: 'relative' }} ref={layoutMenuRef}>
              <button
                onClick={() => { setShowLayoutMenu(s => !s); setShowKolomBeheer(false) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg)', cursor: 'pointer', padding: '4px 10px',
                  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)',
                }}
              >
                <Layers size={13} strokeWidth={1.8} />
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeLayoutNaam}
                </span>
                {isDirty && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                <ChevronDownSm size={11} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} />
              </button>

              {showLayoutMenu && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
                  background: 'white', border: '1px solid var(--border)', borderRadius: 8,
                  minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
                }}>
                  {layouts.length > 0 && (
                    <div style={{ borderBottom: '1px solid var(--border)' }}>
                      {layouts.map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                          <button onClick={() => { applyLayout(l); setShowLayoutMenu(false) }}
                            style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '8px 6px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            {activeLayoutId === l.id ? <Check size={13} color="var(--accent)" /> : <span style={{ width: 13 }} />}
                            {l.naam}
                            {l.is_standaard && <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.06em' }}>standaard</span>}
                          </button>
                          <button onClick={() => handleSetStandaard(l.id)} title={l.is_standaard ? 'Is al standaard' : 'Instellen als standaard'}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: l.is_standaard ? 'var(--accent)' : 'var(--fg-muted)', padding: '4px 5px', fontSize: 13 }}
                          >{l.is_standaard ? '★' : '☆'}</button>
                          <button onClick={() => handleDeleteLayout(l.id)} title="Verwijderen"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px 5px' }}
                          ><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '6px' }}>
                    {isDirty && activeLayoutId && (
                      <button onClick={() => { handleUpdateLayout(); setShowLayoutMenu(false) }} disabled={isPending}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >Wijzigingen opslaan</button>
                    )}
                    <button onClick={() => { setShowSaveAs(true); setShowLayoutMenu(false) }}
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >Opslaan als nieuw…</button>
                  </div>
                </div>
              )}

              {showSaveAs && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300, background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 240 }}>
                  <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px' }}>Naam voor nieuwe layout</p>
                  <input className="eva-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} placeholder="bijv. Compact overzicht"
                    value={saveAsNaam} onChange={e => setSaveAsNaam(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveAs(false) }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="eva-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowSaveAs(false)}>Annuleren</button>
                    <button className="eva-btn-primary" style={{ fontSize: 12 }} onClick={handleSaveAs} disabled={!saveAsNaam.trim() || isPending}>Opslaan</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kolommen beheren */}
          <div style={{ position: 'relative' }} ref={kolomBeheerRef}>
            <button onClick={() => { setShowKolomBeheer(s => !s); setShowLayoutMenu(false) }} title="Kolommen beheren"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 6,
                background: showKolomBeheer ? 'var(--bg-active)' : 'var(--bg)',
                cursor: 'pointer', padding: '4px 8px', color: 'var(--fg-muted)',
              }}
            >
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </button>

            {showKolomBeheer && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300, background: 'white', border: '1px solid var(--border)', borderRadius: 8, width: 210, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '8px 0' }}>
                <div style={{ padding: '0 12px 6px', fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Zichtbare kolommen</div>
                {orderedKolommen.map(k => (
                  <label key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: k.vast ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', opacity: k.vast ? 0.45 : 1 }}>
                    {columnVisibility[k.key] !== false ? <Eye size={13} color="var(--accent)" /> : <EyeOff size={13} color="var(--fg-muted)" />}
                    <input type="checkbox" checked={columnVisibility[k.key] !== false} disabled={k.vast} onChange={e => handleVisibilityChange(k.key, e.target.checked)} style={{ display: 'none' }} />
                    {k.label}
                  </label>
                ))}

                {/* Uitweg uit een zelf dichtgeschroefde weergave — de instellingen worden
                    automatisch bewaard, dus zonder deze knop blijf je eraan vastzitten. */}
                <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 6, paddingTop: 6 }}>
                  <button
                    onClick={herstelWeergave}
                    style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <RotateCcw size={13} strokeWidth={1.8} />
                    Weergave herstellen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Filter chips rij (DS §43 tbl-filters) ── */}
        {hasActiveChips && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '7px 14px', background: 'var(--bg)',
            borderBottom: '1px solid var(--border-soft)',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', flexShrink: 0 }}>Filter:</span>

            {globalFilter && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', border: '1px solid var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-700)', borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 500 }}>
                <span style={{ color: 'var(--fg-muted)', marginRight: 1 }}>Zoek:</span>
                {globalFilter}
                <button onClick={() => setGlobalFilter('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '1px 0 0', color: 'var(--brand-700)', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
              </span>
            )}

            {activeFilters.map(f => {
              const kol = kolommen.find(k => k.key === f.id)
              return (
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', border: '1px solid var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-700)', borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 500 }}>
                  <span style={{ color: 'var(--fg-muted)', marginRight: 1 }}>{kol?.label ?? f.id}:</span>
                  {Array.isArray(f.value) ? (f.value as string[]).join(', ') : String(f.value)}
                  <button onClick={() => table.getColumn(f.id)?.setFilterValue(undefined)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '1px 0 0', color: 'var(--brand-700)', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
                </span>
              )
            })}

            {(activeFilters.length + (globalFilter ? 1 : 0)) > 1 && (
              <button onClick={() => { setColumnFilters([]); setGlobalFilter('') }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', padding: '2px 6px' }}
              >Wis alles</button>
            )}
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ overflowX: 'auto' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  {selecteerbaar && <col style={{ width: 44 }} />}
                  {afvinkKolom && <col style={{ width: 40 }} />}
                  {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select' && h.id !== GROEP_KOLOM).map(header => {
                    if (columnVisibility[header.id] === false) return null
                    return <col key={header.id} style={{ width: header.getSize() }} />
                  })}
                  {toonRijActie && <col style={{ width: 44 }} />}
                </colgroup>
                <thead>
                  <tr>
                    {/* Checkbox header */}
                    {selecteerbaar && (
                      <th style={{ ...thStyle, width: 44, padding: '10px 14px' }}>
                        <Checkbox
                          checked={table.getIsAllPageRowsSelected()}
                          indeterminate={table.getIsSomePageRowsSelected()}
                          onChange={table.getToggleAllPageRowsSelectedHandler() as (v: boolean) => void}
                        />
                      </th>
                    )}

                    {/* Afvink-kolom header */}
                    {afvinkKolom && <th style={{ ...thStyle, width: 40 }} />}

                    {/* Data column headers */}
                    {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select').map(header => {
                      if (columnVisibility[header.id] === false) return null
                      const kol = kolommen.find(k => k.key === header.id)
                      if (!kol) return null
                      const col = header.column
                      const isSorted = col.getIsSorted()
                      return (
                        <DraggableHeaderCell key={header.id} columnId={header.id}
                          style={{ ...thStyle, width: header.getSize(), position: 'relative' }}>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', cursor: col.getCanSort() ? 'pointer' : 'default' }}
                            onClick={col.getCanSort() ? col.getToggleSortingHandler() : undefined}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {col.getCanSort() && <SortIco dir={isSorted} />}
                          </span>
                          <div
                            onMouseDown={e => { e.stopPropagation(); header.getResizeHandler()(e) }}
                            onTouchStart={e => { e.stopPropagation(); header.getResizeHandler()(e) }}
                            onClick={e => e.stopPropagation()}
                            className={`col-resize-handle${header.column.getIsResizing() ? ' is-resizing' : ''}`}
                          />
                        </DraggableHeaderCell>
                      )
                    })}

                    {/* Acties kolom */}
                    {toonRijActie && <th style={{ ...thStyle, width: 44 }} />}
                  </tr>

                  {/* Filter row */}
                  {hasFilters && (
                    <tr>
                      {selecteerbaar && <th style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }} />}
                      {afvinkKolom && <th style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }} />}
                      {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select').map(header => {
                        if (columnVisibility[header.id] === false) return null
                        const kol = kolommen.find(k => k.key === header.id)
                        if (!kol) return null
                        return (
                          <th key={`filter-${header.id}`} style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }}>
                            {kol.filterType === 'tekst' && (
                              <input className="eva-input" style={{ width: '100%', fontSize: 11, padding: '3px 8px' }}
                                placeholder="Filter…"
                                value={(header.column.getFilterValue() as string) ?? ''}
                                onChange={e => { header.column.setFilterValue(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                              />
                            )}
                            {kol.filterType === 'select' && (
                              <MultiSelectFilter
                                opties={kol.filterOpties ?? []}
                                value={(header.column.getFilterValue() as string[]) ?? []}
                                onChange={v => { header.column.setFilterValue(v.length ? v : undefined); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                              />
                            )}
                          </th>
                        )
                      })}
                      {toonRijActie && <th style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }} />}
                    </tr>
                  )}
                </thead>

                <tbody>
                  {table.getRowModel().rows.map(row => {
                    // ── Groepsregel: één cel over de hele breedte, klikken klapt open/dicht ──
                    if (groepering && row.getIsGrouped()) {
                      const isOpen = row.getIsExpanded()
                      return (
                        <tr
                          key={row.id}
                          className="overzicht-groep"
                          onClick={row.getToggleExpandedHandler()}
                          style={{ cursor: 'pointer' }}
                        >
                          <td
                            colSpan={kolomAantal}
                            style={{
                              ...tdStyle,
                              background: 'var(--bg)',
                              borderBottom: '1px solid var(--border)',
                              padding: dicht ? '7px 12px' : '9px 14px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                aria-hidden
                                style={{ display: 'inline-flex', color: 'var(--fg-muted)', flexShrink: 0 }}
                              >
                                {isOpen ? <ChevronDownSm size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
                              </span>
                              {groepering.kop(
                                row.subRows.map(r => r.original),
                                String(row.getGroupingValue(GROEP_KOLOM) ?? ''),
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const isSelected = row.getIsSelected()
                    return (
                      <tr
                        key={row.id}
                        className="overzicht-rij"
                        style={{ cursor: 'pointer', background: isSelected ? 'var(--brand-50)' : undefined }}
                      >
                        {/* Checkbox cell */}
                        {selecteerbaar && (
                          <td style={{ ...tdStyle, width: 44 }} onClick={e => { e.stopPropagation(); row.toggleSelected() }}>
                            <Checkbox checked={isSelected} onChange={() => row.toggleSelected()} />
                          </td>
                        )}

                        {/* Afvink-cel */}
                        {afvinkKolom && (() => {
                          const st = afvinkKolom.status(row.original)
                          const bezig = afvinkKolom.bezigId != null && afvinkKolom.bezigId === row.original.id
                          return (
                            <td style={{ ...tdStyle, width: 40, padding: dicht ? '5px 10px' : '10px 12px' }}>
                              {st !== 'verborgen' && (
                                <button
                                  onClick={e => { e.stopPropagation(); if (!bezig) afvinkKolom.onKlik(row.original) }}
                                  title={st === 'af' ? 'Heropenen' : 'Afvinken'}
                                  aria-label={st === 'af' ? 'Actie heropenen' : 'Actie afvinken'}
                                  disabled={bezig}
                                  style={{
                                    width: 18, height: 18, borderRadius: '50%', padding: 0,
                                    border: `1.5px solid ${st === 'af' ? '#16a34a' : 'var(--border)'}`,
                                    background: st === 'af' ? '#16a34a' : 'white',
                                    display: 'grid', placeItems: 'center',
                                    cursor: bezig ? 'wait' : 'pointer',
                                    opacity: bezig ? 0.5 : 1,
                                    transition: 'background 100ms, border-color 100ms',
                                  }}
                                  className="tbl-afvink"
                                >
                                  {st === 'af' && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  )}
                                </button>
                              )}
                            </td>
                          )
                        })()}

                        {/* Data cells */}
                        {row.getVisibleCells().filter(c => c.column.id !== '__select').map(cell => {
                          if (columnVisibility[cell.column.id] === false) return null
                          return (
                            <td key={cell.id} style={tdStyle}
                              onClick={() => onRijKlik ? onRijKlik(row.original) : router.push(`/${scherm}/${row.original.id}`)}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )
                        })}

                        {/* ⋯ actie-knop */}
                        {toonRijActie && (
                          <td style={{ ...tdStyle, width: 44, padding: '12px 8px' }}>
                            <button
                              onClick={e => { e.stopPropagation(); onRijKlik ? onRijKlik(row.original) : router.push(`/${scherm}/${row.original.id}`) }}
                              style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)' }}
                              className="tbl-action-btn"
                            >
                              <MoreHorizontal size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={kolomAantal}
                        style={{ ...tdStyle, textAlign: 'center', color: 'var(--fg-muted)', padding: '40px 0', borderBottom: 'none' }}
                      >Geen resultaten</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>

        {/* ── Paginering (DS §43 tbl-pagination) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--border)',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)',
          background: 'white',
        }}>
          {/* Links: selectie-info + page size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>
              {selectedCount > 0
                ? `${selectedCount} geselecteerd van ${filteredCount}`
                : `${filteredCount} ${scherm}`
              }
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Rijen:
              <select
                value={pagination.pageSize}
                onChange={e => { table.setPageSize(Number(e.target.value)); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                style={{ height: 26, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-ui)', fontSize: 12, background: 'white', cursor: 'pointer' }}
              >
                {PAGINA_GROOTTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Rechts: pagina-navigatie */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <PagBtn disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft size={13} />
              </PagBtn>
              {pageNumbers().map((p, i) =>
                p === '…'
                  ? <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--fg-muted)', fontSize: 12 }}>…</span>
                  : <PagBtn key={p} active={p === pageIndex} onClick={() => table.setPageIndex(p as number)}>{(p as number) + 1}</PagBtn>
              )}
              <PagBtn disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight size={13} />
              </PagBtn>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tbl-afvink:hover:not(:disabled) { border-color: #16a34a !important; }
        tr.overzicht-groep { transition: background 80ms ease; }
        tr.overzicht-groep:hover td { background: var(--bg-active, #eef2f5) !important; }
        tr.overzicht-rij { transition: background 80ms ease; }
        tr.overzicht-rij:hover td { background: var(--bg); }
        tr.overzicht-rij:has(td [aria-checked="true"]) td,
        tr.overzicht-rij:has(td [aria-checked="true"]):hover td { background: var(--brand-50) !important; }
        .overzicht-th:hover .th-grip { opacity: 0.5 !important; }
        .tbl-action-btn:hover { background: var(--bg) !important; color: var(--fg) !important; }
        .col-resize-handle {
          position: absolute; right: 0; top: 0; bottom: 0;
          width: 5px; cursor: col-resize; user-select: none;
          background: transparent; z-index: 2;
        }
        .col-resize-handle:hover, .col-resize-handle.is-resizing {
          background: var(--accent, #2d7dd2);
          opacity: 0.5;
        }
        .col-resize-handle.is-resizing { opacity: 0.8; }
      `}</style>
    </div>
  )
}
