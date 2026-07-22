'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Trash2, Merge, SplitSquareVertical, Tag, RotateCcw, ChevronDown, ChevronRight, StickyNote, GitBranch, DownloadCloud, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getGroepen, getWerkbegrotingRegels, getWerkbegrotingComponenten,
  slaWerkbegrotingRegelOp, slaWerkbegrotingComponentOp,
  voegWijzigingToe, getInstellingen,
  getCalculatieregelsVoorScenario, getComponentregelsVoorScenario,
} from '@/lib/everts-calc/local-store'
import { getBouw7BewakingscodesImport } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { laadUursoorten } from '@/app/(platform)/instellingen/planning/actions'
import type { PlanningUursoort } from '@everts/database/platform-types'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { nieuweId } from '@/lib/everts-calc/utils'
import type {
  Groep, WerkbegrotingRegel, WerkbegrotingComponent, WerkbegrotingWijziging,
  Materiaal, Calculatieregel, Componentregel,
} from '@/lib/everts-calc/types'
import RelatieZoekveld from './RelatieZoekveld'
import MateriaalZoekveld from './MateriaalZoekveld'
import SamenvoegenModal, { type SamenvoegenItem, type SamenvoegResultaat } from './SamenvoegenModal'

interface Props {
  werkbegrotingId: string
  scenarioId: string
  onWijziging: () => void
  /**
   * Bouw7-bewakingscodes van het gekoppelde project. Als gezet, fungeert de kostengroep-kolom
   * als bewakingscode-picker (kostengroep === bewakingscode). Null = vrije tekst (EVA-origine).
   */
  bewakingscodes?: { code: string; naam: string | null }[] | null
  /** Dossier-id van het gekoppelde Bouw7-project — nodig om codes/bestelregels te importeren. */
  dossierId?: string
  /**
   * Kale bewakingscodes waarop al inkoop verbruikt is (inkooporder/OA-contract/geboekte factuur).
   * Regels op zo'n code worden read-only: ze zijn besteld in Bouw7 en mogen niet meer wijzigen.
   */
  vergrendeldeCodes?: string[] | null
}

/** Kostengroep → kale bewakingscode (strip een eventueel "— naam"-achtervoegsel). */
function bareCode(kostengroep?: string | null): string {
  return (kostengroep ?? '').split(/\s[—-]\s/)[0].trim()
}

/** Kostengroep → omschrijving-deel ("CODE — Naam" → "Naam"), of null. */
function kgNaamDeel(kostengroep?: string | null): string | null {
  const d = (kostengroep ?? '').split(/\s[—-]\s/)
  return d.length > 1 ? (d.slice(1).join(' — ').trim() || null) : null
}

/** Kostengroep-waarde: "CODE — Naam" (met omschrijving) of "CODE". */
function kostengroepLabel(code: string, naam?: string | null): string {
  const n = (naam ?? '').trim()
  return n ? `${code} — ${n}` : code
}

/** Identiteit van een kostengroep = code + omschrijving (onderscheidt dubbele codes). */
function codeIdentiteit(code: string, naam?: string | null): string {
  return `${code.trim()}${(naam ?? '').trim()}`
}

/**
 * Leverancier-velden voor een geïmporteerde bestelregel: onderaanneming vult
 * `aannemersnaam`, alle andere types `leverancier_naam`. De tegenhanger wordt gewist
 * zodat er nooit twee namen tegelijk staan.
 */
function leverancierVelden(
  type: WerkbegrotingComponent['type'],
  naam: string | null,
): Partial<Pick<WerkbegrotingComponent, 'leverancier_naam' | 'aannemersnaam'>> {
  const n = naam?.trim() || undefined
  if (!n) return {}
  return type === 'onderaanneming'
    ? { aannemersnaam: n, leverancier_naam: undefined }
    : { leverancier_naam: n, aannemersnaam: undefined }
}

// ─── Kolom definities ──────────────────────────────────────────────────────────

type ColId =
  | 'selectie'
  | 'kostengroep' | 'omschrijving' | 'opmerking'
  | 'tot_aantal' | 'eenheid'
  | 'component' | 'specificatie'
  | 'prijs_eh' | 'totaalprijs'
  | 'leverancier' | 'acties'

interface ColDef {
  id: ColId; label: string
  dw: number; minW: number
  align: 'left' | 'right' | 'center'
  fixed?: boolean
  thCls?: string; tdCls?: string
}

const COL_DEFS: ColDef[] = [
  { id: 'selectie',    label: '',                 dw: 32,  minW: 32,  align: 'center', fixed: true },
  { id: 'kostengroep', label: 'Kostengroep',      dw: 110, minW: 60,  align: 'left'  },
  { id: 'omschrijving',label: 'Omschrijving',     dw: 200, minW: 100, align: 'left'  },
  { id: 'opmerking',   label: '',                 dw: 28,  minW: 28,  align: 'center', fixed: true },
  { id: 'tot_aantal',  label: 'Totaal aantal',    dw: 76,  minW: 52,  align: 'right' },
  { id: 'eenheid',     label: 'Eh',               dw: 44,  minW: 32,  align: 'left'  },
  { id: 'component',   label: 'Comp.',            dw: 60,  minW: 46,  align: 'left'  },
  { id: 'specificatie',label: 'Specificatie',     dw: 130, minW: 70,  align: 'left'  },
  { id: 'prijs_eh',    label: 'Prijs/eh',         dw: 80,  minW: 56,  align: 'right', thCls: 'text-everts bg-everts-50', tdCls: 'bg-everts-50/30' },
  { id: 'totaalprijs', label: 'Totaalprijs',      dw: 88,  minW: 64,  align: 'right', thCls: 'text-everts bg-everts-50', tdCls: 'bg-everts-50/60' },
  { id: 'leverancier', label: 'Leverancier / OA', dw: 160, minW: 80,  align: 'left'  },
  { id: 'acties',      label: '',                 dw: 28,  minW: 28,  align: 'center', fixed: true },
]

const COL_MAP        = Object.fromEntries(COL_DEFS.map(c => [c.id, c])) as Record<ColId, ColDef>
const DEFAULT_ORDER  = COL_DEFS.map(c => c.id) as ColId[]
const DEFAULT_WIDTHS = Object.fromEntries(COL_DEFS.map(c => [c.id, c.dw])) as Record<ColId, number>

type Sortering = 'kostengroep' | 'component' | 'leverancier' | 'calculatie'

// ─── Tabelrij types ────────────────────────────────────────────────────────────

interface DisplayRij {
  type: 'rij'
  comp: WerkbegrotingComponent
  regel: WerkbegrotingRegel
  groepNaam: string
  totaalAantal: number
  totaalPrijs: number
  calcPrijs: number       // originele calculatie kostprijs (0 = geen bron)
  isSamengevoed?: boolean
}

interface SeparatorRij {
  type: 'separator'
  label: string
  groepTotaal: number
  groepCalcTotaal: number
}

type TabelRij = DisplayRij | SeparatorRij

// ─── BedragInput ──────────────────────────────────────────────────────────────
// Eigen interne state zodat toFixed(2) alleen op blur wordt toegepast,
// niet bij elke toetsaanslag (wat cursor-springen veroorzaakt).

function BedragInput({ value, onChange, className }: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  const [intern, setIntern] = useState(() => value === 0 ? '' : value.toFixed(2))
  const bewerkend = useRef(false)

  useEffect(() => {
    if (!bewerkend.current) {
      setIntern(value === 0 ? '' : value.toFixed(2))
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={intern}
      placeholder="0,00"
      className={className}
      onFocus={() => { bewerkend.current = true }}
      onChange={e => {
        setIntern(e.target.value)
        const v = parseFloat(e.target.value.replace(',', '.'))
        if (!isNaN(v)) onChange(v)
      }}
      onBlur={() => {
        bewerkend.current = false
        const v = parseFloat(intern.replace(',', '.'))
        if (!isNaN(v) && v > 0) { setIntern(v.toFixed(2)); onChange(v) }
        else { setIntern(''); onChange(0) }
      }}
    />
  )
}

// ─── Header ────────────────────────────────────────────────────────────────────

interface HeaderProps {
  colOrder: ColId[]
  colWidths: Record<ColId, number>
  dragOverCol: ColId | null
  allesGeselecteerd: boolean
  onToggleAlles: () => void
  onStartResize: (col: ColId, e: React.MouseEvent) => void
  onColDragStart: (col: ColId) => void
  onColDragOver: (e: React.DragEvent, col: ColId) => void
  onColDrop: (col: ColId) => void
  onColDragEnd: () => void
}

function WbTabelHeader({
  colOrder, colWidths, dragOverCol, allesGeselecteerd, onToggleAlles,
  onStartResize, onColDragStart, onColDragOver, onColDrop, onColDragEnd,
}: HeaderProps) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-white border-b-2 border-slate-200 shadow-sm">
        {colOrder.map(id => {
          const col = COL_MAP[id]
          if (id === 'selectie') return (
            <th key={id} style={{ width: colWidths[id] }} className="px-2 py-2 text-center">
              <input type="checkbox" checked={allesGeselecteerd} onChange={onToggleAlles}
                className="w-3.5 h-3.5 rounded accent-everts cursor-pointer" />
            </th>
          )
          return (
            <th
              key={id}
              draggable={!col.fixed}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onColDragStart(id) }}
              onDragOver={e => onColDragOver(e, id)}
              onDrop={() => onColDrop(id)}
              onDragEnd={onColDragEnd}
              className={[
                'relative px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap',
                !col.fixed ? 'select-none cursor-grab active:cursor-grabbing' : '',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.thCls ?? 'text-slate-500',
                dragOverCol === id ? 'border-l-2 border-everts' : '',
              ].filter(Boolean).join(' ')}
              style={{ width: colWidths[id] }}
            >
              {col.label}
              {!col.fixed && (
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

// ─── Totalen panel ─────────────────────────────────────────────────────────────

interface TotalenPanelProps {
  componenten: WerkbegrotingComponent[]
  regels: WerkbegrotingRegel[]
  calcCompMap: Map<string, Componentregel>
}

function VerschilBadge({ verschil, pct }: { verschil: number; pct: number | null }) {
  if (verschil === 0) return null
  const isWinst = verschil < 0
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded ${
      isWinst ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      {isWinst ? '▼' : '▲'}
      {formatEuro(Math.abs(verschil))}
      {pct !== null && <span className="opacity-70">({Math.abs(pct).toFixed(1)}%)</span>}
    </span>
  )
}

function TotalenPanel({ componenten, regels, calcCompMap }: TotalenPanelProps) {
  const totalen = useMemo(() => {
    const perUurtype = new Map<string, { aantal: number; tarief: number; totaal: number }>()
    const perRelatie = new Map<string, { naam: string; type: 'Leverancier' | 'Onderaannemer'; totaal: number }>()
    let totaalArbeid = 0,    totaalMateriaal = 0,    totaalOA = 0
    let calcArbeid   = 0,    calcMateriaal   = 0,    calcOA   = 0

    for (const comp of componenten) {
      if (comp.is_verwijderd) continue
      const regel = regels.find(r => r.id === comp.werkbegroting_regel_id)
      if (!regel || regel.is_verwijderd) continue
      const totaalAantal = regel.hoeveelheid * comp.norm_hoeveelheid
      const totaalPrijs  = totaalAantal * comp.tarief

      // Originele calc prijs via source_component_id
      const calcComp   = comp.source_component_id ? calcCompMap.get(comp.source_component_id) : null
      const calcPrijs  = calcComp ? regel.hoeveelheid * calcComp.norm_hoeveelheid * calcComp.tarief : 0

      if (comp.type === 'arbeid') {
        totaalArbeid += totaalPrijs; calcArbeid += calcPrijs
        const key = comp.uurtype || 'Ongespecificeerd'
        const b   = perUurtype.get(key) ?? { aantal: 0, tarief: comp.tarief, totaal: 0 }
        b.aantal += totaalAantal; b.totaal += totaalPrijs
        perUurtype.set(key, b)
      } else if (comp.type === 'materieel') {
        totaalMateriaal += totaalPrijs; calcMateriaal += calcPrijs
        const naam = comp.leverancier_naam ?? 'Geen leverancier'
        const key  = `lev:${naam}`
        const b    = perRelatie.get(key) ?? { naam, type: 'Leverancier', totaal: 0 }
        b.totaal += totaalPrijs; perRelatie.set(key, b)
      } else {
        totaalOA += totaalPrijs; calcOA += calcPrijs
        const naam = comp.aannemersnaam ?? comp.leverancier_naam ?? 'Geen onderaannemer'
        const key  = `oa:${naam}`
        const b    = perRelatie.get(key) ?? { naam, type: 'Onderaannemer', totaal: 0 }
        b.totaal += totaalPrijs; perRelatie.set(key, b)
      }
    }

    const eindtotaal  = totaalArbeid + totaalMateriaal + totaalOA
    const calcTotaal  = calcArbeid   + calcMateriaal   + calcOA
    return { perUurtype, perRelatie,
      totaalArbeid, totaalMateriaal, totaalOA, eindtotaal,
      calcArbeid,   calcMateriaal,   calcOA,   calcTotaal }
  }, [componenten, regels, calcCompMap])

  const thCls = 'text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1 border-b border-slate-100 whitespace-nowrap'
  const tdCls = 'py-1 text-[11px] whitespace-nowrap'

  return (
    <aside className="w-80 2xl:w-96 flex-shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Totalen</h3>
      </div>

      {/* Arbeid per uurtype */}
      <div className="px-4 py-3 border-b border-slate-200">
        <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-2">Arbeid per uurtype</h4>
        {totalen.perUurtype.size === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Geen arbeid</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className={thCls}>Uurtype</th>
              <th className={`${thCls} text-right`}>Uren</th>
              <th className={`${thCls} text-right`}>Tarief</th>
              <th className={`${thCls} text-right`}>Totaal</th>
            </tr></thead>
            <tbody>
              {[...totalen.perUurtype.entries()].map(([uurtype, d]) => (
                <tr key={uurtype} className="border-b border-slate-100/60">
                  <td className={`${tdCls} text-slate-700 font-medium truncate max-w-[120px]`} title={uurtype}>{uurtype}</td>
                  <td className={`${tdCls} text-right  text-slate-600`}>{d.aantal % 1 === 0 ? d.aantal.toFixed(0) : d.aantal.toFixed(1)}</td>
                  <td className={`${tdCls} text-right  text-slate-500`}>{formatEuro(d.tarief)}</td>
                  <td className={`${tdCls} text-right  font-semibold text-slate-800`}>{formatEuro(d.totaal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={3} className="pt-1.5 text-[10px] font-bold text-blue-700">Totaal arbeid</td>
                <td className="pt-1.5 text-right  text-[11px] font-bold text-blue-700">{formatEuro(totalen.totaalArbeid)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Per component — incl. verschil vs calculatie */}
      <div className="px-4 py-3 border-b border-slate-200">
        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Per component vs calculatie</h4>
        <table className="w-full">
          <thead><tr>
            <th className={thCls}>Component</th>
            <th className={`${thCls} text-right`}>Calc</th>
            <th className={`${thCls} text-right`}>WB</th>
            <th className={`${thCls} text-right`}>Verschil</th>
          </tr></thead>
          <tbody>
            {[
              { label: 'Arbeid',        wb: totalen.totaalArbeid,    calc: totalen.calcArbeid,    cls: 'text-blue-700'   },
              { label: 'Materiaal',     wb: totalen.totaalMateriaal, calc: totalen.calcMateriaal, cls: 'text-red-700'    },
              { label: 'Onderaanneming',wb: totalen.totaalOA,        calc: totalen.calcOA,        cls: 'text-purple-700' },
            ].filter(r => r.wb > 0 || r.calc > 0).map(r => {
              const diff = r.wb - r.calc
              const pct  = r.calc > 0 ? (diff / r.calc) * 100 : null
              return (
                <tr key={r.label} className="border-b border-slate-100/60">
                  <td className={`${tdCls} ${r.cls} font-medium`}>{r.label}</td>
                  <td className={`${tdCls} text-right  text-slate-400`}>{r.calc > 0 ? formatEuro(r.calc) : '—'}</td>
                  <td className={`${tdCls} text-right  font-semibold text-slate-800`}>{r.wb > 0 ? formatEuro(r.wb) : '—'}</td>
                  <td className={`${tdCls} text-right`}>
                    {r.calc > 0 && <VerschilBadge verschil={diff} pct={pct} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td className="pt-1.5 text-[10px] font-bold text-slate-700">Totaal</td>
              <td className="pt-1.5 text-right  text-[10px] text-slate-400">{formatEuro(totalen.calcTotaal)}</td>
              <td className="pt-1.5 text-right  text-[11px] font-bold text-everts">{formatEuro(totalen.eindtotaal)}</td>
              <td className="pt-1.5 text-right">
                {totalen.calcTotaal > 0 && (
                  <VerschilBadge
                    verschil={totalen.eindtotaal - totalen.calcTotaal}
                    pct={(totalen.eindtotaal - totalen.calcTotaal) / totalen.calcTotaal * 100}
                  />
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Per leverancier / OA */}
      <div className="px-4 py-3 flex-1">
        <h4 className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-2">Per leverancier / OA</h4>
        {totalen.perRelatie.size === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Geen leveranciers of OA</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className={thCls}>Naam</th>
              <th className={`${thCls} text-center`}>Type</th>
              <th className={`${thCls} text-right`}>Totaal</th>
            </tr></thead>
            <tbody>
              {[...totalen.perRelatie.entries()]
                .sort((a, b) => b[1].totaal - a[1].totaal)
                .map(([key, d]) => (
                <tr key={key} className="border-b border-slate-100/60">
                  <td className={`${tdCls} text-slate-700 font-medium truncate max-w-[150px]`} title={d.naam}>{d.naam}</td>
                  <td className={`${tdCls} text-center`}>
                    <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                      d.type === 'Onderaannemer' ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'
                    }`}>{d.type === 'Onderaannemer' ? 'OA' : 'Lev'}</span>
                  </td>
                  <td className={`${tdCls} text-right  font-semibold text-slate-800`}>{formatEuro(d.totaal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={2} className="pt-1.5 text-[10px] font-bold text-red-700">Totaal inkoop</td>
                <td className="pt-1.5 text-right  text-[11px] font-bold text-red-700">
                  {formatEuro(totalen.totaalMateriaal + totalen.totaalOA)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Eindtotaal */}
      {totalen.eindtotaal > 0 && (
        <div className="px-4 py-3 border-t-2 border-slate-300 bg-white sticky bottom-0">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">Totaal werkbegroting</span>
            <span className=" text-sm font-bold text-everts">{formatEuro(totalen.eindtotaal)}</span>
          </div>
          {totalen.calcTotaal > 0 && (() => {
            const diff = totalen.eindtotaal - totalen.calcTotaal
            const pct  = (diff / totalen.calcTotaal) * 100
            return (
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-slate-400">vs calculatie {formatEuro(totalen.calcTotaal)}</span>
                <VerschilBadge verschil={diff} pct={pct} />
              </div>
            )
          })()}
        </div>
      )}
    </aside>
  )
}

// ─── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function WerkbegrotingGrid({ werkbegrotingId, scenarioId, onWijziging, bewakingscodes, dossierId, vergrendeldeCodes }: Props) {
  const [groepen,         setGroepen]         = useState<Groep[]>([])
  const [regels,          setRegels]          = useState<WerkbegrotingRegel[]>([])
  const [componenten,     setComponenten]     = useState<WerkbegrotingComponent[]>([])
  const [calcRegels,      setCalcRegels]      = useState<Calculatieregel[]>([])
  const [calcComponenten, setCalcComponenten] = useState<Componentregel[]>([])
  const [selectie,    setSelectie]    = useState<Set<string>>(new Set())
  const [samenvoegen, setSamenvoegen] = useState(false)
  const [sortering,   setSortering]   = useState<Sortering>('kostengroep')
  const [verwijderdOpen, setVerwijderdOpen] = useState(false)

  // Interne opmerking popover
  const [opmerkingEditId, setOpmerkingEditId] = useState<string | null>(null)

  // Samenvoegen modal
  const [samenvoegenItems, setSamenvoegenItems] = useState<SamenvoegenItem[] | null>(null)

  // Nieuwe kostengroep form
  const [kgFormOpen, setKgFormOpen] = useState(false)
  const [kgNaam,     setKgNaam]     = useState('')

  // Kolom-staat
  const [colOrder,    setColOrder]    = useState<ColId[]>(DEFAULT_ORDER)
  const [colWidths,   setColWidths]   = useState<Record<ColId, number>>(DEFAULT_WIDTHS)
  const [dragCol,     setDragCol]     = useState<ColId | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColId | null>(null)
  // Rij-slepen voor kostengroep-herindeling
  const [dragCompId,  setDragCompId]  = useState<string | null>(null)
  const [dragOverSep, setDragOverSep] = useState<string | null>(null)

  // Instellingen (standaard kostengroepen)
  const instellingen = useMemo(() => getInstellingen(), [])

  // Uursoorten uit de instellingen (bron voor de arbeid-specificatie + kostprijs-tarief).
  const [uursoorten, setUursoorten] = useState<PlanningUursoort[]>([])
  useEffect(() => {
    let actief = true
    laadUursoorten()
      .then(res => { if (actief && res.ok) setUursoorten(res.data.filter(u => u.actief)) })
      .catch(() => { /* stil — dropdown valt terug op vrije tekst */ })
    return () => { actief = false }
  }, [])

  // Calculatie lookup maps voor verschil-berekening en sortering
  const calcCompMap  = useMemo(() => new Map(calcComponenten.map(c => [c.id, c])), [calcComponenten])
  const calcRegelMap = useMemo(() => new Map(calcRegels.map(r => [r.id, r])), [calcRegels])

  // Groep-boomvolgorde: depth-first traversal → elk groep_id krijgt een sort-index
  const groepVolgorde = useMemo(() => {
    const byParent = new Map<string | null, Groep[]>()
    for (const g of groepen) {
      const key = g.parent_id ?? null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(g)
    }
    for (const children of byParent.values()) children.sort((a, b) => a.volgorde - b.volgorde)
    const result = new Map<string, number>()
    let idx = 0
    const traverse = (parentId: string | null) => {
      for (const g of byParent.get(parentId) ?? []) { result.set(g.id, idx++); traverse(g.id) }
    }
    traverse(null)
    return result
  }, [groepen])

  // Volledige pad per groep: "Ouder › Kind › Kleinkind"
  const groepPad = useMemo(() => {
    const groepMap = new Map(groepen.map(g => [g.id, g]))
    const result   = new Map<string, string>()
    for (const g of groepen) {
      const pad: string[] = [g.naam]
      let cur = g
      while (cur.parent_id) {
        const parent = groepMap.get(cur.parent_id); if (!parent) break
        pad.unshift(parent.naam); cur = parent
      }
      result.set(g.id, pad.join(' › '))
    }
    return result
  }, [groepen])

  // ─── Laden ────────────────────────────────────────────────────────────────
  const laad = useCallback(() => {
    const wbRegels = getWerkbegrotingRegels(werkbegrotingId)
    const regelIds = new Set(wbRegels.map(r => r.id))
    setGroepen(getGroepen(scenarioId))
    setRegels(wbRegels)
    setComponenten(getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id)))
    setCalcRegels(getCalculatieregelsVoorScenario(scenarioId))
    setCalcComponenten(getComponentregelsVoorScenario(scenarioId))
  }, [werkbegrotingId, scenarioId])

  useEffect(() => { laad() }, [laad])
  useEffect(() => { laad() }, [werkbegrotingId, laad])

  // ─── Kolom resize ─────────────────────────────────────────────────────────
  const startResize = (col: ColId, e: React.MouseEvent) => {
    const startX = e.clientX; const startW = colWidths[col]
    const onMove = (me: MouseEvent) =>
      setColWidths(prev => ({ ...prev, [col]: Math.max(COL_MAP[col].minW, startW + me.clientX - startX) }))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ─── Kolom drag reorder ───────────────────────────────────────────────────
  const onColDragStart = (col: ColId) => { if (!COL_MAP[col].fixed) setDragCol(col) }
  const onColDragOver  = (e: React.DragEvent, col: ColId) => {
    e.preventDefault()
    if (dragCol && dragCol !== col && !COL_MAP[col].fixed) setDragOverCol(col)
  }
  const onColDrop = (col: ColId) => {
    if (!dragCol || dragCol === col) { setDragCol(null); setDragOverCol(null); return }
    setColOrder(prev => {
      const next = [...prev]; const fi = next.indexOf(dragCol); const ti = next.indexOf(col)
      next.splice(fi, 1); next.splice(ti, 0, dragCol); return next
    })
    setDragCol(null); setDragOverCol(null)
  }
  const onColDragEnd = () => { setDragCol(null); setDragOverCol(null) }

  // ─── Kostengroep datalist ──────────────────────────────────────────────────
  // Bij een Bouw7-gekoppeld project: de projectbewakingscodes (kostengroep === bewakingscode).
  // Anders (EVA-origine): de eerder gebruikte kostengroepen + de standaardlijst.
  const alleKostengroepen = useMemo((): { value: string; label: string | null }[] => {
    if (bewakingscodes && bewakingscodes.length > 0) {
      // Waarde = "CODE — Naam" zodat gelijk-genummerde codes apart kiesbaar zijn en de
      // kostengroep-string de omschrijving draagt (identiteit code + omschrijving).
      return bewakingscodes.map(b => ({ value: kostengroepLabel(b.code, b.naam), label: b.naam }))
    }
    const fromRegels = regels.map(r => r.kostengroep).filter(Boolean) as string[]
    const fromInst   = instellingen.standaard_kostengroepen ?? []
    return [...new Set([...fromRegels, ...fromInst])].sort().map(v => ({ value: v, label: null }))
  }, [regels, instellingen, bewakingscodes])

  // Bewakingscode → omschrijving/naam, voor het tonen van de codenaam in de groepskoppen.
  const codeNaam = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of bewakingscodes ?? []) {
      if (b.naam) m.set(bareCode(b.code), b.naam)
    }
    return m
  }, [bewakingscodes])

  // ─── Actieve en verwijderde componenten ───────────────────────────────────
  const actieveComponenten  = useMemo(() => componenten.filter(c => !c.is_verwijderd), [componenten])
  const verwijderdeComponenten = useMemo(() => componenten.filter(c => c.is_verwijderd), [componenten])

  // ─── Tabelrijen opbouwen ──────────────────────────────────────────────────
  const tabelRijen = useMemo((): TabelRij[] => {
    const groepMap = new Map(groepen.map(g => [g.id, g]))

    const displayRijen: DisplayRij[] = []
    for (const regel of regels) {
      if (regel.is_verwijderd) continue
      const groepNaam  = groepMap.get(regel.groep_id)?.naam ?? '—'
      const regelComps = actieveComponenten.filter(c => c.werkbegroting_regel_id === regel.id)
      for (const comp of regelComps) {
        const totaalAantal = regel.hoeveelheid * comp.norm_hoeveelheid
        const calcComp     = comp.source_component_id ? calcCompMap.get(comp.source_component_id) : null
        const calcPrijs    = calcComp ? regel.hoeveelheid * calcComp.norm_hoeveelheid * calcComp.tarief : 0
        displayRijen.push({ type: 'rij', comp, regel, groepNaam, totaalAantal, totaalPrijs: totaalAantal * comp.tarief, calcPrijs })
      }
    }

    // Samenvoegen: materiaal met zelfde artikelnummer + leverancier
    let verwerkt = displayRijen
    if (samenvoegen) {
      const merged: DisplayRij[] = []; const idx = new Map<string, DisplayRij>()
      for (const rij of displayRijen) {
        if (rij.comp.type !== 'materieel' || !rij.comp.artikelnummer) { merged.push(rij); continue }
        const key = `${rij.comp.artikelnummer}||${rij.comp.leverancier_naam ?? ''}`
        const b = idx.get(key)
        if (b) { b.totaalAantal += rij.totaalAantal; b.totaalPrijs += rij.totaalPrijs; b.isSamengevoed = true }
        else { const k = { ...rij }; merged.push(k); idx.set(key, k) }
      }
      verwerkt = merged
    }

    // Sorteren
    const typeVolgorde: Record<string, number> = { arbeid: 0, materieel: 1, onderaanneming: 2 }

    if (sortering === 'component') {
      verwerkt.sort((a, b) => {
        const ta = typeVolgorde[a.comp.type] ?? 9; const tb = typeVolgorde[b.comp.type] ?? 9
        if (ta !== tb) return ta - tb
        return (a.regel.kostengroep ?? '\uffff').localeCompare(b.regel.kostengroep ?? '\uffff', 'nl')
      })
    } else if (sortering === 'leverancier') {
      verwerkt.sort((a, b) => {
        const nA = (a.comp.leverancier_naam ?? a.comp.aannemersnaam ?? '').trim()
        const nB = (b.comp.leverancier_naam ?? b.comp.aannemersnaam ?? '').trim()
        if (!nA && nB) return 1; if (nA && !nB) return -1
        return nA.localeCompare(nB, 'nl')
      })
    } else if (sortering === 'calculatie') {
      verwerkt.sort((a, b) => {
        const cra = a.regel.source_calculatieregel_id ? calcRegelMap.get(a.regel.source_calculatieregel_id) : null
        const crb = b.regel.source_calculatieregel_id ? calcRegelMap.get(b.regel.source_calculatieregel_id) : null
        const ga  = cra ? (groepVolgorde.get(cra.groep_id) ?? 9999) : 9999
        const gb  = crb ? (groepVolgorde.get(crb.groep_id) ?? 9999) : 9999
        if (ga !== gb) return ga - gb
        return (cra?.volgorde ?? 9999) - (crb?.volgorde ?? 9999)
      })
    } else {
      verwerkt.sort((a, b) => {
        const kgA = a.regel.kostengroep ?? '\uffff'; const kgB = b.regel.kostengroep ?? '\uffff'
        if (kgA !== kgB) return kgA.localeCompare(kgB, 'nl')
        if (a.groepNaam !== b.groepNaam) return a.groepNaam.localeCompare(b.groepNaam, 'nl')
        return a.regel.volgorde - b.regel.volgorde
      })
    }

    // Separator-rijen met totaalprijs per groep
    const getSepLabel = (rij: DisplayRij): string => {
      if (sortering === 'component') return rij.comp.type === 'arbeid' ? 'Arbeid' : rij.comp.type === 'materieel' ? 'Materiaal' : 'Onderaanneming'
      if (sortering === 'leverancier') {
        const naam = (rij.comp.leverancier_naam ?? rij.comp.aannemersnaam ?? '').trim()
        return naam || 'Geen leverancier / OA'
      }
      if (sortering === 'calculatie') {
        const cr = rij.regel.source_calculatieregel_id ? calcRegelMap.get(rij.regel.source_calculatieregel_id) : null
        return cr ? (groepPad.get(cr.groep_id) ?? rij.groepNaam) : rij.groepNaam
      }
      return rij.regel.kostengroep ?? 'Geen kostengroep'
    }

    const groepTotalen     = new Map<string, number>()
    const groepCalcTotalen = new Map<string, number>()
    for (const rij of verwerkt) {
      const lbl = getSepLabel(rij)
      groepTotalen.set(lbl,     (groepTotalen.get(lbl)     ?? 0) + rij.totaalPrijs)
      groepCalcTotalen.set(lbl, (groepCalcTotalen.get(lbl) ?? 0) + rij.calcPrijs)
    }

    const result: TabelRij[] = []
    let vorigeLabel: string | undefined = undefined
    for (const rij of verwerkt) {
      const label = getSepLabel(rij)
      if (label !== vorigeLabel) {
        result.push({
          type: 'separator', label,
          groepTotaal:     groepTotalen.get(label)     ?? 0,
          groepCalcTotaal: groepCalcTotalen.get(label) ?? 0,
        })
        vorigeLabel = label
      }
      result.push(rij)
    }

    return result
  }, [groepen, regels, actieveComponenten, samenvoegen, sortering, calcCompMap, calcRegelMap, groepVolgorde, groepPad])

  // ─── Selectie helpers ─────────────────────────────────────────────────────
  const displayRijen = tabelRijen.filter((r): r is DisplayRij => r.type === 'rij')
  const allesGeselecteerd = displayRijen.length > 0 && displayRijen.every(r => selectie.has(r.comp.id))

  const toggleAllesSelectie = () => {
    if (allesGeselecteerd) setSelectie(new Set())
    else setSelectie(new Set(displayRijen.map(r => r.comp.id)))
  }

  // ─── Vergrendeling (bestelde regels in Bouw7) ───────────────────────────────
  // Regels waarvan de kostengroep (kale bewakingscode) al besteld is, zijn read-only:
  // ze mogen in EVA niet meer wijzigen zodat de sync ze in Bouw7 nooit hoeft aan te raken.
  const vergrendeldSet = useMemo(
    () => new Set((vergrendeldeCodes ?? []).map(c => c.trim()).filter(Boolean)),
    [vergrendeldeCodes],
  )
  const regelVergrendeld = useCallback(
    (kostengroep?: string | null) => vergrendeldSet.size > 0 && vergrendeldSet.has(bareCode(kostengroep)),
    [vergrendeldSet],
  )
  const lockToastTs = useRef(0)
  const meldVergrendeld = useCallback(() => {
    const nu = Date.now()
    if (nu - lockToastTs.current > 1500) {
      lockToastTs.current = nu
      toast('Deze regel is besteld in Bouw7 en daarom vergrendeld.', { icon: '🔒' })
    }
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const onComponentWijzig = useCallback((compId: string, patch: Partial<WerkbegrotingComponent>) => {
    const comp = componenten.find(c => c.id === compId); if (!comp) return
    const regel0 = regels.find(r => r.id === comp.werkbegroting_regel_id)
    if (regelVergrendeld(regel0?.kostengroep)) { meldVergrendeld(); return }
    for (const [veld, nw] of Object.entries(patch)) {
      const ow = (comp as unknown as Record<string, unknown>)[veld]; if (ow === nw) continue
      voegWijzigingToe({ id: nieuweId(), werkbegroting_id: werkbegrotingId,
        werkbegroting_regel_id: comp.werkbegroting_regel_id, component_id: compId, veld,
        oude_waarde: ow !== undefined ? String(ow) : null,
        nieuwe_waarde: nw !== undefined ? String(nw) : null,
        user_id: null, aangemaakt_op: new Date().toISOString() } as WerkbegrotingWijziging)
    }
    const bij = { ...comp, ...patch }
    slaWerkbegrotingComponentOp(bij)
    setComponenten(prev => prev.map(c => c.id === compId ? bij : c))
    onWijziging()
  }, [componenten, regels, werkbegrotingId, onWijziging, regelVergrendeld, meldVergrendeld])

  const onRegelWijzig = useCallback((regelId: string, patch: Partial<WerkbegrotingRegel>) => {
    const regel = regels.find(r => r.id === regelId); if (!regel) return
    if (regelVergrendeld(regel.kostengroep)) { meldVergrendeld(); return }
    const bij = { ...regel, ...patch }
    slaWerkbegrotingRegelOp(bij)
    setRegels(prev => prev.map(r => r.id === regelId ? bij : r))
    onWijziging()
  }, [regels, onWijziging, regelVergrendeld, meldVergrendeld])

  // Type wijzigen → eenheid auto-instellen bij arbeid
  const onTypeWijzig = useCallback((compId: string, type: WerkbegrotingComponent['type']) => {
    const patch: Partial<WerkbegrotingComponent> = { type }
    if (type === 'arbeid') patch.eenheid = 'uur'
    onComponentWijzig(compId, patch)
  }, [onComponentWijzig])

  // Uursoort selecteren → automatisch het ingestelde kostprijs-tarief invullen.
  const onUurtypeKies = useCallback((compId: string, uursoortNaam: string) => {
    const gevonden = uursoorten.find(u => u.naam === uursoortNaam)
    const patch: Partial<WerkbegrotingComponent> = { uurtype: uursoortNaam || undefined }
    if (gevonden) patch.tarief = gevonden.tarief_kostprijs ?? 0
    onComponentWijzig(compId, patch)
  }, [uursoorten, onComponentWijzig])

  // Materiaal selecteren uit bibliotheek
  const onMateriaalKies = useCallback((compId: string, materiaal: Materiaal) => {
    onComponentWijzig(compId, {
      artikelnummer:    materiaal.artikelnummer,
      omschrijving:     materiaal.omschrijving,
      leverancier_naam: materiaal.leverancier,
      eenheid:          materiaal.eenheid as WerkbegrotingComponent['eenheid'],
      tarief:           materiaal.kostprijs,
    })
  }, [onComponentWijzig])

  const voegNieuweRegelToe = useCallback((kostengroep?: string) => {
    const nieuwRegel: WerkbegrotingRegel = {
      id: nieuweId(), werkbegroting_id: werkbegrotingId,
      source_calculatieregel_id: null, groep_id: '',
      omschrijving: '', hoeveelheid: 1, eenheid: 'st',
      volgorde: regels.length + 1, kostengroep,
    }
    const nieuwComp: WerkbegrotingComponent = {
      id: nieuweId(), werkbegroting_regel_id: nieuwRegel.id,
      source_component_id: null, type: 'materieel', norm_hoeveelheid: 1, tarief: 0,
    }
    slaWerkbegrotingRegelOp(nieuwRegel); slaWerkbegrotingComponentOp(nieuwComp)
    setRegels(prev => [...prev, nieuwRegel]); setComponenten(prev => [...prev, nieuwComp])
    onWijziging()
  }, [werkbegrotingId, regels.length, onWijziging])

  const bevestigNieuweKostengroep = () => {
    const naam = kgNaam.trim(); if (!naam) return
    voegNieuweRegelToe(naam); setKgNaam(''); setKgFormOpen(false)
  }

  // ─── Import bewakingscodes + bestelregels uit Bouw7 (Scenario B) ────────────
  const [importBezig, setImportBezig] = useState(false)
  const importeerUitBouw7 = useCallback(async () => {
    if (!dossierId || importBezig) return
    setImportBezig(true)
    try {
      const res = await getBouw7BewakingscodesImport(dossierId)
      if (!res.ok) { toast.error(res.error); return }

      // Bestaande regels indexeren op identiteit (code + omschrijving), zodat gelijk-genummerde
      // bewakingscodes elk hun eigen kostengroep-regel krijgen en niet samenvallen.
      const regelVoorIdentity = new Map<string, string>()
      for (const r of regels) {
        const c = bareCode(r.kostengroep)
        if (!c) continue
        const key = codeIdentiteit(c, kgNaamDeel(r.kostengroep))
        if (!regelVoorIdentity.has(key)) regelVoorIdentity.set(key, r.id)
      }

      // Reeds overgehaalde bestelregels herkennen zodat ze niet dubbel toegevoegd worden.
      // Primair op het stabiele Bouw7-line-id; voor componenten van vóór deze wijziging
      // (zonder id) een composiet content-sleutel als fallback. Soft-deleted telt mee:
      // een bewust verwijderde regel mag niet terugkeren.
      const contentKey = (code: string, type: string, oms: string, aantal: number, prijs: number, eenheid: string) =>
        [code, type, oms, aantal, prijs, eenheid].join('|')
      // Bestaande componenten per Bouw7-line-id (voor "bijwerken of overslaan"); voor legacy-
      // componenten zónder line-id een content-sleutel als fallback-dedup van nieuwe regels.
      const compPerLineId = new Map<number, WerkbegrotingComponent>()
      const bestaandeContentKeys = new Set<string>()
      for (const c of componenten) {
        if (c.bouw7_line_id != null) { compPerLineId.set(c.bouw7_line_id, c); continue }
        const r = regels.find(x => x.id === c.werkbegroting_regel_id)
        bestaandeContentKeys.add(contentKey(
          bareCode(r?.kostengroep), c.type, c.omschrijving ?? '',
          c.norm_hoeveelheid, c.tarief, c.eenheid ?? 'st',
        ))
      }
      let overgeslagen = 0
      let bijgewerkt = 0

      const nieuweRegels: WerkbegrotingRegel[] = []
      const nieuweComps: WerkbegrotingComponent[] = []
      const updates: { id: string; patch: Partial<WerkbegrotingComponent> }[] = []
      let volg = regels.length + 1
      const ensureRegel = (code: string, naam: string | null): string => {
        const key = codeIdentiteit(code, naam)
        const bestaand = regelVoorIdentity.get(key)
        if (bestaand) return bestaand
        const regel: WerkbegrotingRegel = {
          id: nieuweId(), werkbegroting_id: werkbegrotingId, source_calculatieregel_id: null,
          groep_id: '', omschrijving: naam ?? '', hoeveelheid: 1, eenheid: 'st',
          volgorde: volg++, kostengroep: kostengroepLabel(code, naam),
        }
        nieuweRegels.push(regel); regelVoorIdentity.set(key, regel.id)
        return regel.id
      }

      // 1) Placeholder-regel per Bouw7-bewakingscode (identiteit = code + omschrijving) die nog niet bestaat.
      for (const c of res.codes) ensureRegel(c.code, c.naam)
      // 2) Bestelregels onder de juiste code: nieuw toevoegen, GEWIJZIGDE bijwerken, ongewijzigde overslaan.
      const regelMetComponent = new Set<string>()
      for (const b of res.bestelregels) {
        const nieuweEenheid = (b.eenheid || 'st') as WerkbegrotingComponent['eenheid']
        const bestaand = compPerLineId.get(b.bouw7LineId)
        if (bestaand) {
          // Bewust verwijderde regel mag niet terugkeren.
          if (bestaand.is_verwijderd) { overgeslagen++; continue }
          const huidigeRegel = regels.find(x => x.id === bestaand.werkbegroting_regel_id)
          const huidigeIdentity = codeIdentiteit(bareCode(huidigeRegel?.kostengroep), kgNaamDeel(huidigeRegel?.kostengroep))
          const doelIdentity = codeIdentiteit(b.code, b.codeNaam)
          const verplaatst = huidigeIdentity !== doelIdentity
          // Leverancier aanvullen als die nog ontbreekt (handmatige keuze nooit overschrijven).
          const heeftLeverancier = !!(bestaand.leverancier_naam || bestaand.aannemersnaam || bestaand.relatie_id)
          const leverancierAanvulbaar = !heeftLeverancier && !!b.leverancierNaam
          const gewijzigd =
            Math.abs((bestaand.norm_hoeveelheid ?? 0) - b.aantal) > 0.0001 ||
            Math.abs((bestaand.tarief ?? 0) - b.prijs) > 0.0001 ||
            (bestaand.eenheid ?? 'st') !== (b.eenheid || 'st') ||
            (bestaand.omschrijving ?? '') !== (b.omschrijving ?? '') ||
            bestaand.type !== b.type ||
            verplaatst ||
            leverancierAanvulbaar
          if (!gewijzigd) { overgeslagen++; continue }
          const patch: Partial<WerkbegrotingComponent> = {
            norm_hoeveelheid: b.aantal, tarief: b.prijs, eenheid: nieuweEenheid,
            type: b.type, omschrijving: b.omschrijving || undefined,
          }
          if (leverancierAanvulbaar) Object.assign(patch, leverancierVelden(b.type, b.leverancierNaam))
          // Verplaatst naar een andere bewakingscode (code + omschrijving) → koppel aan (zo nodig nieuwe) regel.
          if (verplaatst) {
            const rid = ensureRegel(b.code, b.codeNaam)
            patch.werkbegroting_regel_id = rid
            regelMetComponent.add(rid)
          }
          updates.push({ id: bestaand.id, patch })
          bijgewerkt++
          continue
        }
        // Geen line-id-match → nieuw (legacy content-match wordt overgeslagen).
        if (bestaandeContentKeys.has(contentKey(b.code, b.type, b.omschrijving ?? '', b.aantal, b.prijs, b.eenheid || 'st'))) {
          overgeslagen++; continue
        }
        const regelId = ensureRegel(b.code, b.codeNaam)
        nieuweComps.push({
          id: nieuweId(), werkbegroting_regel_id: regelId, source_component_id: null,
          bouw7_line_id: b.bouw7LineId,
          type: b.type, norm_hoeveelheid: b.aantal, tarief: b.prijs,
          eenheid: nieuweEenheid,
          omschrijving: b.omschrijving || undefined,
          ...leverancierVelden(b.type, b.leverancierNaam),
        })
        regelMetComponent.add(regelId)
      }
      // 3) Nieuwe codes zónder bestelregel: een lege component (met de code-naam als omschrijving),
      //    anders is de regel onzichtbaar (de grid bouwt rijen per component) en niet bewerkbaar.
      for (const regel of nieuweRegels) {
        if (regelMetComponent.has(regel.id)) continue
        nieuweComps.push({
          id: nieuweId(), werkbegroting_regel_id: regel.id, source_component_id: null,
          type: 'materieel', norm_hoeveelheid: 1, tarief: 0,
          omschrijving: regel.omschrijving || regel.kostengroep || undefined,
        })
      }

      nieuweRegels.forEach(slaWerkbegrotingRegelOp)
      nieuweComps.forEach(slaWerkbegrotingComponentOp)
      setRegels(prev => [...prev, ...nieuweRegels])
      setComponenten(prev => [...prev, ...nieuweComps])
      // Gewijzigde bestelregels bijwerken — ná het opslaan van eventueel nieuwe regels,
      // zodat een verplaatste component naar een bestaande/persisted regel verwijst.
      updates.forEach(u => onComponentWijzig(u.id, u.patch))
      onWijziging()
      const delen = [`${nieuweRegels.length} bewakingscode(s), ${nieuweComps.length} nieuwe bestelregel(s)`]
      if (bijgewerkt) delen.push(`${bijgewerkt} bijgewerkt`)
      if (overgeslagen) delen.push(`${overgeslagen} ongewijzigd (overgeslagen)`)
      toast.success(`Geïmporteerd: ${delen.join(' — ')}.`)
    } finally {
      setImportBezig(false)
    }
  }, [dossierId, importBezig, regels, componenten, werkbegrotingId, onWijziging, onComponentWijzig])

  // Soft-delete component
  const verwijderComp = useCallback((compId: string) => {
    onComponentWijzig(compId, { is_verwijderd: true })
    setSelectie(prev => { const n = new Set(prev); n.delete(compId); return n })
  }, [onComponentWijzig])

  // Herstel soft-deleted component
  const herstelComp = useCallback((compId: string) => {
    onComponentWijzig(compId, { is_verwijderd: false })
  }, [onComponentWijzig])

  // ─── Samenvoegen ──────────────────────────────────────────────────────────
  const geselecteerdeMaterialen = useMemo(() =>
    displayRijen.filter(r => selectie.has(r.comp.id) && r.comp.type === 'materieel'),
  [displayRijen, selectie])

  const samenvoegenFout = useMemo(() => {
    if (geselecteerdeMaterialen.length < 2) return 'Selecteer minimaal 2 materiaalregels'
    const kostengroepen = new Set(geselecteerdeMaterialen.map(r => r.regel.kostengroep ?? ''))
    if (kostengroepen.size > 1) return 'Alle regels moeten dezelfde kostengroep hebben'
    return null
  }, [geselecteerdeMaterialen])

  const handleSamenvoegenKlik = useCallback(() => {
    if (samenvoegenFout || geselecteerdeMaterialen.length < 2) return

    // Bepaal of alles dezelfde specificatie heeft (artikelnummer + naam + leverancier)
    const getKey = (r: typeof geselecteerdeMaterialen[0]) =>
      [r.comp.artikelnummer ?? r.comp.omschrijving ?? '', r.comp.leverancier_naam ?? ''].join('||')
    const uniek = new Set(geselecteerdeMaterialen.map(getKey))
    const isZelfdeSpec = uniek.size === 1 && geselecteerdeMaterialen[0].comp.artikelnummer !== undefined

    const items: SamenvoegenItem[] = geselecteerdeMaterialen.map(r => ({
      comp: r.comp, regel: r.regel, totaalAantal: r.totaalAantal, totaalPrijs: r.totaalPrijs,
    }))

    if (isZelfdeSpec) {
      // Automatisch samenvoegen zonder modal
      const totaalAantal = items.reduce((s, i) => s + i.totaalAantal, 0)
      voerSamenvoegingUit({
        omschrijving:     items[0].comp.omschrijving ?? items[0].regel.omschrijving ?? '',
        artikelnummer:    items[0].comp.artikelnummer,
        leverancier_naam: items[0].comp.leverancier_naam,
        eenheid:          items[0].comp.eenheid ?? items[0].regel.eenheid ?? 'st',
        totaalAantal,
        prijsPerEenheid:  items[0].comp.tarief,
      }, items)
    } else {
      setSamenvoegenItems(items)
    }
  }, [samenvoegenFout, geselecteerdeMaterialen])  // eslint-disable-line

  const voerSamenvoegingUit = useCallback((data: SamenvoegResultaat, bronItems: SamenvoegenItem[]) => {
    const eersteRegel = bronItems[0].regel

    const nieuweRegel: WerkbegrotingRegel = {
      id: nieuweId(), werkbegroting_id: werkbegrotingId,
      source_calculatieregel_id: null,
      groep_id: eersteRegel.groep_id,
      omschrijving: data.omschrijving,
      hoeveelheid: 1,
      eenheid: data.eenheid as WerkbegrotingRegel['eenheid'],
      kostengroep: eersteRegel.kostengroep,
      volgorde: regels.length + 1,
    }
    const nieuweComp: WerkbegrotingComponent = {
      id: nieuweId(), werkbegroting_regel_id: nieuweRegel.id,
      source_component_id: null, type: 'materieel',
      norm_hoeveelheid: data.totaalAantal,
      eenheid: data.eenheid as WerkbegrotingComponent['eenheid'],
      tarief: data.prijsPerEenheid,
      artikelnummer: data.artikelnummer,
      omschrijving: data.omschrijving,
      leverancier_naam: data.leverancier_naam,
    }

    // Soft-delete bronregels
    const bronIds = new Set(bronItems.map(i => i.comp.id))
    slaWerkbegrotingRegelOp(nieuweRegel)
    slaWerkbegrotingComponentOp(nieuweComp)
    setComponenten(prev => [
      ...prev.map(c => bronIds.has(c.id) ? { ...c, is_verwijderd: true } : c),
      nieuweComp,
    ])
    setRegels(prev => [...prev, nieuweRegel])
    setSelectie(new Set())
    setSamenvoegenItems(null)
    onWijziging()
  }, [werkbegrotingId, regels.length, onWijziging])

  // ─── Cel-renderer ─────────────────────────────────────────────────────────
  const renderCell = (id: ColId, rij: DisplayRij): React.ReactNode => {
    const col  = COL_MAP[id]
    const base = `${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`
    const { comp, regel, groepNaam, totaalAantal, totaalPrijs, isSamengevoed } = rij
    const isGeselecteerd = selectie.has(comp.id)

    const inputCls = `w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
      hover:bg-white hover:border hover:border-slate-200
      focus:bg-white focus:border focus:border-everts/40 focus:outline-none placeholder-slate-300`

    switch (id) {
      case 'selectie':
        return (
          <td key={id} className="px-2 py-1 text-center">
            <input type="checkbox" checked={isGeselecteerd}
              onChange={() => setSelectie(prev => {
                const n = new Set(prev); n.has(comp.id) ? n.delete(comp.id) : n.add(comp.id); return n
              })}
              className="w-3.5 h-3.5 rounded accent-everts cursor-pointer" />
          </td>
        )

      case 'kostengroep': {
        const kgVergrendeld = regelVergrendeld(regel.kostengroep)
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            <div className="flex items-center gap-1">
              {kgVergrendeld && (
                <Lock className="w-3 h-3 shrink-0 text-slate-400" aria-label="Besteld in Bouw7 — vergrendeld" />
              )}
              <input
                list="kg-datalist"
                value={regel.kostengroep ?? ''}
                onChange={e => onRegelWijzig(regel.id, { kostengroep: e.target.value })}
                readOnly={kgVergrendeld}
                placeholder="—"
                title={kgVergrendeld ? 'Besteld in Bouw7 — vergrendeld' : (regel.kostengroep ?? (bewakingscodes ? 'Kies een bewakingscode' : 'Kostengroep'))}
                className={`w-full text-xs px-1 py-0.5 bg-transparent border border-transparent rounded truncate
                  ${kgVergrendeld ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 hover:border-slate-200 focus:border-everts focus:bg-white focus:outline-none'}`}
              />
            </div>
          </td>
        )
      }

      case 'omschrijving':
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            <input
              className={`${inputCls} text-slate-700 font-medium w-full min-w-0`}
              value={comp.omschrijving ?? regel.omschrijving ?? ''}
              placeholder="Omschrijving…"
              onChange={e => onComponentWijzig(comp.id, { omschrijving: e.target.value || undefined })}
            />
          </td>
        )

      case 'opmerking': {
        const heeftOpmerking = !!regel.opmerking
        const isOpen = opmerkingEditId === regel.id
        return (
          <td key={id} className="px-1 py-1 text-center relative">
            <div className="relative inline-flex group/note">
              <button
                onClick={() => setOpmerkingEditId(isOpen ? null : regel.id)}
                title={heeftOpmerking && !isOpen ? regel.opmerking : undefined}
                className={[
                  'w-5 h-5 flex items-center justify-center rounded transition-colors',
                  heeftOpmerking
                    ? 'text-amber-400 hover:text-amber-500 hover:bg-amber-50'
                    : 'text-slate-200 opacity-0 group-hover:opacity-100 hover:text-slate-400 hover:bg-slate-50',
                ].join(' ')}
              >
                <StickyNote className="w-3.5 h-3.5" />
              </button>

              {/* Hover-tooltip (alleen lezen, CSS-driven) */}
              {heeftOpmerking && !isOpen && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
                  invisible group-hover/note:visible
                  w-52 bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-2 shadow-lg
                  whitespace-pre-wrap leading-relaxed">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Interne opmerking</p>
                  {regel.opmerking}
                </div>
              )}

              {/* Klik-popover voor bewerken */}
              {isOpen && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
                  w-56 bg-white border border-slate-200 rounded-lg shadow-xl p-2.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Interne opmerking</p>
                  <textarea
                    autoFocus
                    rows={3}
                    className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md resize-none
                      focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20 text-slate-700"
                    value={regel.opmerking ?? ''}
                    placeholder="Niet zichtbaar voor de klant…"
                    onChange={e => onRegelWijzig(regel.id, { opmerking: e.target.value || undefined })}
                    onBlur={() => setOpmerkingEditId(null)}
                    onKeyDown={e => { if (e.key === 'Escape') setOpmerkingEditId(null) }}
                  />
                </div>
              )}
            </div>
          </td>
        )
      }

      case 'tot_aantal':
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            <input
              type="number" step="0.01" min="0"
              value={totaalAantal === 0 ? '' : +(totaalAantal.toFixed(2))}
              className={`${inputCls} text-right  font-semibold text-slate-700`}
              placeholder="0"
              onChange={e => {
                const nieuw = parseFloat(e.target.value) || 0
                const normH = regel.hoeveelheid > 0 ? nieuw / regel.hoeveelheid : nieuw
                onComponentWijzig(comp.id, { norm_hoeveelheid: normH })
              }}
            />
            {isSamengevoed && <span className="text-[9px] text-blue-400 ml-0.5">∑</span>}
          </td>
        )

      case 'eenheid':
        return (
          <td key={id} className={`px-1 py-1.5 ${base}`}>
            {comp.type === 'arbeid' ? (
              <span className=" text-[11px] text-teal-600 font-semibold px-1">uur</span>
            ) : (
              <input className={`${inputCls} text-slate-600  text-[11px]`}
                value={comp.eenheid ?? regel.eenheid ?? ''}
                placeholder="eh"
                onChange={e => onComponentWijzig(comp.id, { eenheid: e.target.value as never || undefined })} />
            )}
          </td>
        )

      case 'component': {
        const typeKleur = comp.type === 'arbeid'
          ? 'text-blue-600' : comp.type === 'materieel'
          ? 'text-orange-600' : 'text-purple-600'
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            <div className="relative flex items-center">
              <select
                value={comp.type}
                title={comp.type === 'arbeid' ? 'Arbeid' : comp.type === 'materieel' ? 'Materiaal' : 'Onderaanneming'}
                className={`w-full appearance-none text-xs px-1 py-0.5 pr-3 rounded border-0 bg-transparent
                  hover:bg-white hover:border hover:border-slate-200
                  focus:bg-white focus:border focus:border-everts/40 focus:outline-none
                  font-medium cursor-pointer ${typeKleur}`}
                onChange={e => onTypeWijzig(comp.id, e.target.value as WerkbegrotingComponent['type'])}
              >
                <option value="arbeid">Arb</option>
                <option value="materieel">Mat</option>
                <option value="onderaanneming">OA</option>
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none flex-shrink-0" />
            </div>
          </td>
        )
      }

      case 'specificatie':
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            {comp.type === 'arbeid' && (
              uursoorten.length > 0 ? (
                <div className="relative flex items-center">
                  <select
                    value={comp.uurtype ?? ''}
                    className="w-full appearance-none text-xs px-1 py-0.5 pr-4 rounded border-0 bg-transparent
                      hover:bg-white hover:border hover:border-slate-200
                      focus:bg-white focus:border focus:border-everts/40 focus:outline-none
                      text-slate-600 cursor-pointer"
                    onChange={e => onUurtypeKies(comp.id, e.target.value)}
                  >
                    <option value="">— Uursoort —</option>
                    {uursoorten.map(u => (
                      <option key={u.id} value={u.naam}>
                        {u.naam}{u.tarief_kostprijs != null ? ` (${formatEuro(u.tarief_kostprijs)}/uur)` : ''}
                      </option>
                    ))}
                    {/* Bewaar een eerder gekozen (of vrije-tekst) waarde die niet meer in de lijst staat. */}
                    {comp.uurtype && !uursoorten.some(u => u.naam === comp.uurtype) && (
                      <option value={comp.uurtype}>{comp.uurtype}</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-0.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none flex-shrink-0" />
                </div>
              ) : (
                <input className={`${inputCls} text-slate-600`} value={comp.uurtype ?? ''} placeholder="Uursoort…"
                  onChange={e => onComponentWijzig(comp.id, { uurtype: e.target.value || undefined })} />
              )
            )}
            {comp.type === 'materieel' && (
              /* Materiaal: zoeken in bibliotheek */
              <MateriaalZoekveld
                artikelnummer={comp.artikelnummer}
                omschrijving={comp.omschrijving}
                onSelecteer={m => onMateriaalKies(comp.id, m)}
                onWis={() => onComponentWijzig(comp.id, {
                  artikelnummer: undefined, leverancier_naam: undefined, tarief: 0,
                })}
              />
            )}
            {comp.type === 'onderaanneming' && (
              <input className={`${inputCls} text-slate-600`} value={comp.offertenummer ?? ''} placeholder="Offertenr…"
                onChange={e => onComponentWijzig(comp.id, { offertenummer: e.target.value || undefined })} />
            )}
          </td>
        )

      case 'prijs_eh':
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            <div className="flex items-center gap-0.5">
              <span className="text-[11px] text-slate-400 flex-shrink-0 ">€</span>
              <BedragInput
                value={comp.tarief}
                onChange={v => onComponentWijzig(comp.id, { tarief: v })}
                className={`${inputCls} text-right  text-slate-700 flex-1`}
              />
            </div>
          </td>
        )

      case 'totaalprijs':
        return (
          <td key={id} className={`px-2 py-1.5 ${base}`}>
            <span className={` font-semibold ${totaalPrijs > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
              {totaalPrijs > 0 ? formatEuro(totaalPrijs) : '—'}
            </span>
          </td>
        )

      case 'leverancier':
        return (
          <td key={id} className={`px-1 py-1 ${base}`}>
            {comp.type !== 'arbeid' && !isSamengevoed && (
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <RelatieZoekveld
                    type={comp.type === 'onderaanneming' ? 'onderaannemer' : 'leverancier'}
                    relatieId={comp.relatie_id}
                    relatieNaam={comp.leverancier_naam ?? comp.aannemersnaam}
                    onSelecteer={(rid, naam) => {
                      if (comp.type === 'onderaanneming')
                        onComponentWijzig(comp.id, { relatie_id: rid, aannemersnaam: naam, leverancier_naam: undefined })
                      else
                        onComponentWijzig(comp.id, { relatie_id: rid, leverancier_naam: naam, aannemersnaam: undefined })
                    }}
                    onWis={() => onComponentWijzig(comp.id, { relatie_id: undefined, leverancier_naam: undefined, aannemersnaam: undefined })}
                  />
                </div>
                {/* Winkelbudget: budgetreservering bij deze leverancier i.p.v. losse artikelen.
                    Alleen bij materiaal, en alleen zinvol mét gekoppelde leverancier — zonder
                    relatie kan er in Bouw7 geen order/leverbon op naam gemaakt worden. */}
                {comp.type === 'materieel' && (
                  <button
                    onClick={() => onComponentWijzig(comp.id, { is_winkel: !comp.is_winkel })}
                    disabled={!comp.relatie_id}
                    title={comp.relatie_id
                      ? (comp.is_winkel ? 'Winkelbudget uitzetten' : 'Als winkelbudget bestellen — één bedrag i.p.v. losse artikelen')
                      : 'Kies eerst een leverancier'}
                    className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                      comp.is_winkel
                        ? 'border-amber-300 bg-amber-50 text-amber-700 font-semibold'
                        : 'border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50'
                    }`}
                  >
                    {comp.is_winkel ? '✓ Winkel' : 'Winkel'}
                  </button>
                )}
              </div>
            )}
            {comp.type !== 'arbeid' && isSamengevoed && (
              <span className="text-xs text-slate-500 px-1">{comp.leverancier_naam ?? comp.aannemersnaam ?? '—'}</span>
            )}
          </td>
        )

      case 'acties':
        return (
          <td key={id} className="px-1 py-1 text-center">
            <button onClick={() => verwijderComp(comp.id)}
              className="w-5 h-5 mx-auto flex items-center justify-center text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              title="Verwijderen"><Trash2 className="w-3 h-3" /></button>
          </td>
        )

      default: return <td key={id} />
    }
  }

  const totalW = colOrder.reduce((s, id) => s + colWidths[id], 0)

  const sortBtn = (s: Sortering, label: string) => (
    <button
      onClick={() => setSortering(s)}
      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
        sortering === s ? 'bg-everts text-white border-everts' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >{label}</button>
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Tabel ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Werkbalk */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
          <button onClick={() => voegNieuweRegelToe()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-everts text-white rounded-lg hover:bg-everts/90 transition-colors font-semibold">
            <Plus className="w-3.5 h-3.5" /> Nieuwe regel
          </button>

          <button onClick={() => setKgFormOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Tag className="w-3.5 h-3.5" /> Nieuwe kostengroep
          </button>

          {dossierId && bewakingscodes && (
            <button onClick={importeerUitBouw7} disabled={importBezig}
              title="Bewakingscodes en bestelregels uit Bouw7 overhalen naar deze werkbegroting"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <DownloadCloud className="w-3.5 h-3.5" /> {importBezig ? 'Importeren…' : 'Uit Bouw7 overhalen'}
            </button>
          )}

          <button onClick={() => setSamenvoegen(v => !v)}
            title={samenvoegen ? 'Toon alle afzonderlijke regels' : 'Materiaal met zelfde artikelnr + leverancier samenvoegen'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              samenvoegen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {samenvoegen ? <SplitSquareVertical className="w-3.5 h-3.5" /> : <Merge className="w-3.5 h-3.5" />}
            {samenvoegen ? 'Uitvouwen' : 'Weergave samenvoegen'}
          </button>

          {/* Samenvoeg selectie — alleen zichtbaar bij selectie van ≥2 materialen */}
          {geselecteerdeMaterialen.length >= 2 && (
            <button
              onClick={handleSamenvoegenKlik}
              disabled={!!samenvoegenFout}
              title={samenvoegenFout ?? `${geselecteerdeMaterialen.length} materiaalregels samenvoegen`}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors
                bg-everts-50 border-everts/40 text-everts font-semibold
                hover:bg-everts hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Merge className="w-3.5 h-3.5" />
              Selectie samenvoegen ({geselecteerdeMaterialen.length})
            </button>
          )}
          {/* Waarschuwing als selectie ongeldige mix is */}
          {geselecteerdeMaterialen.length >= 2 && samenvoegenFout && (
            <span className="text-[10px] text-red-500 font-medium">{samenvoegenFout}</span>
          )}

          <div className="w-px h-5 bg-slate-200 mx-1" />

          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Sortering:</span>
          {sortBtn('kostengroep', 'Kostengroep')}
          {sortBtn('component',   'Component')}
          {sortBtn('leverancier', 'Leverancier / OA')}
          {sortBtn('calculatie',  'Calculatie')}
        </div>

        {/* Nieuwe kostengroep form */}
        {kgFormOpen && (
          <div className="flex items-center gap-2 px-3 py-2 bg-everts-50 border-b border-everts/20 flex-shrink-0">
            <Tag className="w-3.5 h-3.5 text-everts flex-shrink-0" />
            <span className="text-xs text-slate-600">Naam nieuwe kostengroep:</span>
            <input autoFocus value={kgNaam} onChange={e => setKgNaam(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') bevestigNieuweKostengroep(); if (e.key === 'Escape') { setKgFormOpen(false); setKgNaam('') } }}
              list="kg-datalist"
              placeholder="bijv. Bouwplaats"
              className="flex-1 text-xs px-2 py-1 border border-everts/40 rounded focus:outline-none focus:ring-1 focus:ring-everts bg-white" />
            <button onClick={bevestigNieuweKostengroep} className="text-xs bg-everts text-white px-2 py-1 rounded hover:bg-everts-dark">✓</button>
            <button onClick={() => { setKgFormOpen(false); setKgNaam('') }} className="text-xs text-slate-400 px-1 hover:text-slate-600">✕</button>
          </div>
        )}

        {/* Datalist kostengroepen / bewakingscodes */}
        <datalist id="kg-datalist">
          {alleKostengroepen.map(kg => <option key={kg.value} value={kg.value}>{kg.label ?? undefined}</option>)}
        </datalist>

        {/* Scroll-container */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="border-collapse text-xs w-full" style={{ tableLayout: 'fixed', minWidth: `${totalW}px` }}>
            <colgroup>{colOrder.map(id => <col key={id} style={{ width: colWidths[id] }} />)}</colgroup>

            <WbTabelHeader
              colOrder={colOrder} colWidths={colWidths} dragOverCol={dragOverCol}
              allesGeselecteerd={allesGeselecteerd} onToggleAlles={toggleAllesSelectie}
              onStartResize={startResize}
              onColDragStart={onColDragStart} onColDragOver={onColDragOver}
              onColDrop={onColDrop} onColDragEnd={onColDragEnd}
            />

            <tbody>
              {tabelRijen.length === 0 && (
                <tr><td colSpan={colOrder.length} className="text-center py-16 text-slate-400 text-sm">
                  Nog geen regels — klik &lsquo;Nieuwe regel&rsquo; om te beginnen.
                </td></tr>
              )}

              {tabelRijen.map((rij, i) => {
                if (rij.type === 'separator') {
                  const isDropTarget = sortering === 'kostengroep' && dragCompId !== null
                  const isHovered    = dragOverSep === rij.label
                  return (
                    <tr key={`sep-${i}`}
                      className={[
                        'border-y transition-colors',
                        isHovered
                          ? 'bg-everts/10 border-everts/40'
                          : 'bg-slate-100/80 border-slate-200',
                      ].join(' ')}
                      onDragOver={e => { if (isDropTarget) { e.preventDefault(); setDragOverSep(rij.label) } }}
                      onDragLeave={() => setDragOverSep(null)}
                      onDrop={() => {
                        if (!dragCompId || !isDropTarget) return
                        const comp  = componenten.find(c => c.id === dragCompId)
                        const regel = comp ? regels.find(r => r.id === comp.werkbegroting_regel_id) : null
                        if (regel) onRegelWijzig(regel.id, { kostengroep: rij.label === 'Geen kostengroep' ? undefined : rij.label })
                        setDragCompId(null); setDragOverSep(null)
                      }}
                    >
                      <td colSpan={colOrder.length} className="py-1 px-3">
                        <div className="flex items-center justify-between gap-4">
                          <span className={[
                            'text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5',
                            isHovered ? 'text-everts' : 'text-slate-600',
                          ].join(' ')}>
                            {sortering === 'calculatie' && (
                              <GitBranch className="w-3 h-3 flex-shrink-0 opacity-50" />
                            )}
                            {rij.label}
                            {sortering === 'kostengroep' && codeNaam.get(bareCode(rij.label)) && (
                              <span className="ml-1.5 normal-case font-normal tracking-normal text-slate-400">
                                — {codeNaam.get(bareCode(rij.label))}
                              </span>
                            )}
                            {isHovered && <span className="ml-2 normal-case font-normal text-everts/70">↓ Hier neerzetten</span>}
                          </span>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {rij.groepCalcTotaal > 0 && (
                              <span className="text-[10px] text-slate-400 ">
                                Calc: {formatEuro(rij.groepCalcTotaal)}
                              </span>
                            )}
                            {rij.groepTotaal > 0 && (
                              <span className=" text-[11px] font-bold text-slate-700">{formatEuro(rij.groepTotaal)}</span>
                            )}
                            {rij.groepCalcTotaal > 0 && rij.groepTotaal > 0 && (() => {
                              const diff = rij.groepTotaal - rij.groepCalcTotaal
                              const pct  = (diff / rij.groepCalcTotaal) * 100
                              return <VerschilBadge verschil={diff} pct={pct} />
                            })()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={`${rij.comp.id}-${rij.isSamengevoed ? 'm' : 's'}`}
                    draggable={sortering === 'kostengroep'}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragCompId(rij.comp.id) }}
                    onDragEnd={() => { setDragCompId(null); setDragOverSep(null) }}
                    className={[
                      'border-b border-slate-100 hover:bg-slate-50/50 group',
                      sortering === 'kostengroep' ? 'cursor-grab active:cursor-grabbing' : '',
                      dragCompId === rij.comp.id ? 'opacity-40' : '',
                      selectie.has(rij.comp.id) ? 'bg-everts-50/30' : '',
                      rij.comp.type === 'arbeid' ? 'bg-blue-50/10' : '',
                      rij.comp.type === 'onderaanneming' ? 'bg-purple-50/10' : '',
                    ].filter(Boolean).join(' ')}>
                    {colOrder.map(id => renderCell(id, rij))}
                  </tr>
                )
              })}
            </tbody>

            {/* Footer totaalrij */}
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                {colOrder.map(id => {
                  if (id === 'omschrijving') return <td key={id} className="px-2 py-2 text-xs font-bold text-slate-700">Totaal werkbegroting</td>
                  if (id === 'totaalprijs') {
                    const grand = displayRijen.reduce((s, r) => s + r.totaalPrijs, 0)
                    return <td key={id} className="px-2 py-2 text-right bg-everts-50">
                      <span className=" text-sm font-bold text-everts">{formatEuro(grand)}</span>
                    </td>
                  }
                  return <td key={id} />
                })}
              </tr>
            </tfoot>
          </table>

          {/* ── Verwijderde regels sectie ──────────────────────────────────── */}
          {verwijderdeComponenten.length > 0 && (
            <div className="mt-4 mx-2 mb-4 border border-dashed border-slate-200 rounded-lg overflow-hidden">
              {/* Toggle header */}
              <button
                onClick={() => setVerwijderdOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {verwijderdOpen
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  }
                  <span className="text-xs font-semibold text-slate-500">
                    Verwijderde regels ({verwijderdeComponenten.length})
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Klik om {verwijderdOpen ? 'te sluiten' : 'te bekijken'}</span>
              </button>

              {/* Verwijderde items list */}
              {verwijderdOpen && (
                <div className="divide-y divide-slate-100">
                  {verwijderdeComponenten.map(comp => {
                    const regel = regels.find(r => r.id === comp.werkbegroting_regel_id)
                    const groepNaam = groepen.find(g => g.id === regel?.groep_id)?.naam ?? '—'
                    const totaalAantal = (regel?.hoeveelheid ?? 0) * comp.norm_hoeveelheid
                    const totaalPrijs  = totaalAantal * comp.tarief
                    const typeLabel = comp.type === 'arbeid' ? 'Arbeid' : comp.type === 'materieel' ? 'Materiaal' : 'OA'
                    const typeCls   = comp.type === 'arbeid' ? 'bg-blue-50 text-blue-600' : comp.type === 'materieel' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'

                    return (
                      <div key={comp.id} className="flex items-center gap-3 px-4 py-2 bg-white opacity-60 hover:opacity-90 transition-opacity">
                        {/* Type badge */}
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${typeCls}`}>{typeLabel}</span>

                        {/* Kostengroep */}
                        {regel?.kostengroep && (
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{regel.kostengroep}</span>
                        )}

                        {/* Omschrijving */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-600 truncate line-through">
                            {regel?.omschrijving ?? '—'}
                            {comp.omschrijving && <span className="text-slate-400"> — {comp.omschrijving}</span>}
                          </p>
                          <p className="text-[10px] text-slate-400">{groepNaam}</p>
                        </div>

                        {/* Specificatie */}
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {comp.type === 'arbeid' && comp.uurtype}
                          {comp.type === 'materieel' && (comp.artikelnummer ?? comp.leverancier_naam)}
                          {comp.type === 'onderaanneming' && (comp.aannemersnaam ?? comp.offertenummer)}
                        </span>

                        {/* Bedrag */}
                        {totaalPrijs > 0 && (
                          <span className="text-xs  text-slate-500 flex-shrink-0 line-through">{formatEuro(totaalPrijs)}</span>
                        )}

                        {/* Herstel knop */}
                        <button
                          onClick={() => herstelComp(comp.id)}
                          title="Regel herstellen"
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-500 hover:border-everts hover:text-everts hover:bg-everts-50 transition-colors flex-shrink-0"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Herstel
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Totalen panel ────────────────────────────────────────────────── */}
      <TotalenPanel componenten={componenten} regels={regels} calcCompMap={calcCompMap} />

      {/* ── Samenvoegen modal ─────────────────────────────────────────────── */}
      {samenvoegenItems && (
        <SamenvoegenModal
          items={samenvoegenItems}
          onBevestig={data => voerSamenvoegingUit(data, samenvoegenItems)}
          onSluit={() => setSamenvoegenItems(null)}
        />
      )}
    </div>
  )
}
