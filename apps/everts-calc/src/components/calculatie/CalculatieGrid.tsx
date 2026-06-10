'use client'

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useTransition } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, AlignLeft, Search, MessageSquare, Undo2, Move, CopyPlus, X, PaintBucket, BookmarkPlus, Loader2, ImagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getGroepen, getCalculatieregels, getComponentregels,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp, upsertComponentregel,
  verwijderGroep, verwijderCalculatieregel, verwijderComponentregel, voegComponentregelToe, getInstellingen,
  herstelSnapshot,
} from '@/lib/local-store'
import {
  berekenCalculatieregel, berekenGroepKostprijs, berekenGroepVP,
  berekenScenarioKostprijs, berekenScenarioVP, berekeningNummers, formatEuro, formatPct, formatGetal,
} from '@/lib/calculations'
import { nieuweId, cn } from '@/lib/utils'
import type { Groep, Calculatieregel, Componentregel, Scenario, Eenheid } from '@/lib/types'
import { EENHEDEN } from '@/lib/types'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ActiviteitToevoegenModal from '@/components/calculatie/ActiviteitToevoegenModal'
import { slaRegelOpAlsRecept } from '@/app/actions/bibliotheek'

import type { BibliotheekItemVereenvoudigd } from '@/lib/types'

interface Props {
  scenarioId: string
  scenario: Scenario
  actiefGroepId: string | null
  onGroepActief: (id: string) => void
  onWijziging: () => void
  onUndoCountChange?: (count: number) => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
}

export interface CalculatieGridHandle {
  undo: () => void
  collapseAll: () => void
}

type Snapshot = { groepen: Groep[]; regels: Calculatieregel[]; componenten: Componentregel[] }

// ─── Kolom definities ─────────────────────────────────────────────────────────

type ColId =
  'kostengroep' | 'omschrijving' | 'aant' | 'eenh' | 'stelpost' | 'markeer' |
  'uur_eenh' | 'min_eenh' | 'tarief_ab' | 'bedrag_ab' |
  'prijs_mt' | 'bedrag_mt' | 'prijs_oa' | 'bedrag_oa' |
  'kp_eenh' | 'tot_kp' | 'opslag_pct' | 'vp_eenh' | 'tot_vp' |
  'btw_pct' | 'acties'

interface ColDef {
  id: ColId; label: string; title?: string
  dw: number; minW: number; align: 'left' | 'right' | 'center'
  thCls?: string; tdCls?: string
}

const COL_DEFS: ColDef[] = [
  { id: 'kostengroep',  label: 'Kostengroep', title: 'Kostengroep (werkbegroting)', dw: 110, minW: 70, align: 'left', thCls: 'text-slate-400', tdCls: 'bg-slate-50/50' },
  { id: 'omschrijving', label: 'Omschrijving', dw: 260, minW: 100, align: 'left' },
  { id: 'aant',         label: 'Aant.',        dw: 56,  minW: 40,  align: 'right' },
  { id: 'eenh',         label: 'Eenh.',        dw: 44,  minW: 36,  align: 'left' },
  { id: 'stelpost',     label: 'STP', title: 'Stelpost (provisorische som)', dw: 32, minW: 28, align: 'center' },
  { id: 'markeer',      label: '⚑', title: 'Markeer regel', dw: 32, minW: 28, align: 'center' },
  { id: 'uur_eenh',  label: 'Uur/e.',    dw: 56,  minW: 40, align: 'right', thCls: 'text-blue-500 bg-blue-50/50',    tdCls: 'bg-blue-50/20' },
  { id: 'min_eenh',  label: 'Min/e.',    dw: 56,  minW: 40, align: 'right', thCls: 'text-blue-400 bg-blue-50/30',    tdCls: 'bg-blue-50/15' },
  { id: 'tarief_ab', label: 'Tarief AB', dw: 64,  minW: 48, align: 'right', thCls: 'text-blue-500 bg-blue-50/50',    tdCls: 'bg-blue-50/20' },
  { id: 'bedrag_ab', label: 'Bedrag AB', dw: 76,  minW: 56, align: 'right', thCls: 'text-blue-600 bg-blue-50/70',    tdCls: 'bg-blue-50/30' },
  { id: 'prijs_mt',  label: 'Prijs MA',  dw: 68,  minW: 48, align: 'right', thCls: 'text-red-600 bg-red-50/50',     tdCls: 'bg-red-50/20' },
  { id: 'bedrag_mt', label: 'Bedrag MA', dw: 76,  minW: 56, align: 'right', thCls: 'text-red-700 bg-red-50/70',     tdCls: 'bg-red-50/30' },
  { id: 'prijs_oa',  label: 'Prijs OA',  dw: 68,  minW: 48, align: 'right', thCls: 'text-purple-600 bg-purple-50/50', tdCls: 'bg-purple-50/20' },
  { id: 'bedrag_oa', label: 'Bedrag OA', dw: 76,  minW: 56, align: 'right', thCls: 'text-purple-700 bg-purple-50/70', tdCls: 'bg-purple-50/30' },
  { id: 'kp_eenh',   label: 'KP/e.',    dw: 68,  minW: 48, align: 'right', thCls: 'text-slate-600',                  tdCls: 'bg-slate-50' },
  { id: 'tot_kp',    label: 'Tot. KP',  dw: 80,  minW: 60, align: 'right', thCls: 'text-everts bg-everts-50',         tdCls: 'bg-everts-50/50' },
  { id: 'opslag_pct',label: 'Opsl.%',   dw: 52,  minW: 44, align: 'right', thCls: 'text-everts bg-everts-50/60',      tdCls: 'bg-everts-50/40' },
  { id: 'vp_eenh',   label: 'VP/e.',    dw: 68,  minW: 48, align: 'right', thCls: 'text-everts bg-everts-50/80',      tdCls: 'bg-everts-50/60' },
  { id: 'tot_vp',    label: 'Tot. VP',  dw: 80,  minW: 60, align: 'right', thCls: 'text-everts bg-everts-50',         tdCls: 'bg-everts-50/80' },
  { id: 'btw_pct',   label: 'BTW %',   dw: 44,  minW: 36, align: 'right' },
  { id: 'acties',    label: '',         dw: 28,  minW: 28, align: 'center' },
]

const COL_MAP     = Object.fromEntries(COL_DEFS.map(c => [c.id, c])) as Record<ColId, ColDef>
const DEFAULT_ORDER  = COL_DEFS.map(c => c.id) as ColId[]
const DEFAULT_WIDTHS = Object.fromEntries(COL_DEFS.map(c => [c.id, c.dw])) as Record<ColId, number>

// ─── TabelHeader ──────────────────────────────────────────────────────────────

interface TabelHeaderProps {
  colOrder: ColId[]
  colWidths: Record<ColId, number>
  kolomNamen: Record<string, string>
  onStartResize: (col: ColId, e: React.MouseEvent) => void
  dragOverCol: ColId | null
  onColDragStart: (col: ColId) => void
  onColDragOver: (e: React.DragEvent, col: ColId) => void
  onColDrop: (col: ColId) => void
  onColDragEnd: () => void
}

function TabelHeader({
  colOrder, colWidths, kolomNamen, onStartResize, dragOverCol,
  onColDragStart, onColDragOver, onColDrop, onColDragEnd,
}: TabelHeaderProps) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-white border-b-2 border-slate-200 shadow-sm">
        {colOrder.map(id => {
          const col = COL_MAP[id]
          return (
            <th
              key={id}
              title={col.title}
              draggable={id !== 'acties'}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onColDragStart(id) }}
              onDragOver={e => onColDragOver(e, id)}
              onDrop={() => onColDrop(id)}
              onDragEnd={onColDragEnd}
              className={[
                'relative px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
                'select-none cursor-grab active:cursor-grabbing',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.thCls ?? 'text-slate-500',
                dragOverCol === id ? 'border-l-2 border-everts' : '',
              ].filter(Boolean).join(' ')}
              style={{ width: colWidths[id] }}
            >
              {kolomNamen[id] ?? col.label}
              {id !== 'acties' && (
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

// ─── ComponentRegelRij ───────────────────────────────────────────────────────

function ComponentRegelRij({
  comp, uurtarieven, eenheden, colOrder, indent, regelHoeveelheid, regelOmschrijving, regelOpslag, onWijzig, onVerwijder,
}: {
  comp: Componentregel
  uurtarieven: { label: string; tarief: number }[]
  eenheden: string[]
  colOrder: ColId[]
  indent: number
  regelHoeveelheid: number
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

  // Bedragen + VP (gebruik lokale edit-staat voor live feedback)
  const compBedrag      = normEdit * tariefEdit * regelHoeveelheid
  const compKpPe        = regelHoeveelheid > 0 ? compBedrag / regelHoeveelheid : 0
  const effectiefOpslag = comp.opslag_pct ?? regelOpslag
  const compVpTotaal    = compBedrag * (1 + effectiefOpslag / 100)
  const compVpPe        = regelHoeveelheid > 0 ? compVpTotaal / regelHoeveelheid : 0

  const niComp = (val: number, onChange: (v: number) => void, step = '0.01', cls = '') => (
    <input
      type="number" step={step} min="0"
      value={val === 0 ? '' : +val.toFixed(2)}
      className={`w-full text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent
        hover:bg-white hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none ${cls}`}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
    />
  )

  const renderCompCell = (id: ColId): React.ReactNode => {
    const col = COL_MAP[id]
    const tdBase = `px-1 py-0.5 ${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`

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
                  className={`w-24 font-mono ${inputCls}`}
                />
              </>
            )}
          </div>
        </td>
      )
      case 'aant': return (
        <td key={id} className={tdBase}>
          {niComp(normEdit, v => { setNormEdit(v); deb('norm', () => onWijzig({ norm_hoeveelheid: v })) }, '0.001')}
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
            {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </td>
      )
      case 'uur_eenh': return (
        <td key={id} className={tdBase}>
          {comp.type === 'arbeid' && niComp(
            normEdit,
            v => { setNormEdit(v); deb('norm', () => onWijzig({ norm_hoeveelheid: v })) },
            '0.01', 'text-blue-700'
          )}
        </td>
      )
      case 'min_eenh': return (
        <td key={id} className={tdBase}>
          {comp.type === 'arbeid' && niComp(
            +(normEdit * 60).toFixed(2),
            v => { const u = +(v / 60).toFixed(4); setNormEdit(u); deb('norm', () => onWijzig({ norm_hoeveelheid: u })) },
            '0.01', 'text-blue-600'
          )}
        </td>
      )
      case 'tarief_ab': return (
        <td key={id} className={tdBase}>
          {comp.type === 'arbeid' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            '0.01', 'text-blue-700'
          )}
        </td>
      )
      case 'bedrag_ab': return (
        <td key={id} className={tdBase}>
          {comp.type === 'arbeid' && compBedrag > 0 && (
            <span className="font-mono text-xs text-blue-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'prijs_mt': return (
        <td key={id} className={tdBase}>
          {comp.type === 'materieel' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            '0.01', 'text-red-700'
          )}
        </td>
      )
      case 'bedrag_mt': return (
        <td key={id} className={tdBase}>
          {comp.type === 'materieel' && compBedrag > 0 && (
            <span className="font-mono text-xs text-red-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'prijs_oa': return (
        <td key={id} className={tdBase}>
          {comp.type === 'onderaanneming' && niComp(
            tariefEdit,
            v => { setTariefEdit(v); deb('tarief', () => onWijzig({ tarief: v })) },
            '0.01', 'text-purple-700'
          )}
        </td>
      )
      case 'bedrag_oa': return (
        <td key={id} className={tdBase}>
          {comp.type === 'onderaanneming' && compBedrag > 0 && (
            <span className="font-mono text-xs text-purple-700 font-semibold">{formatEuro(compBedrag)}</span>
          )}
        </td>
      )
      case 'kp_eenh': return (
        <td key={id} className={tdBase}>
          {compKpPe > 0 && <span className="font-mono text-xs text-slate-600">{formatEuro(compKpPe)}</span>}
        </td>
      )
      case 'tot_kp': return (
        <td key={id} className={tdBase}>
          {compBedrag > 0 && <span className="font-mono text-xs text-slate-700 font-semibold">{formatEuro(compBedrag)}</span>}
        </td>
      )
      case 'opslag_pct': return (
        <td key={id} className={tdBase}>
          <div className="flex items-center justify-start gap-0.5">
            <input
              type="number" min="0" max="100" step="0.01"
              value={comp.opslag_pct !== undefined ? +comp.opslag_pct.toFixed(2) : ''}
              placeholder={regelOpslag.toFixed(2)}
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                onWijzig({ opslag_pct: v !== undefined && isNaN(v) ? undefined : v })
              }}
              className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border border-transparent bg-transparent hover:border-slate-200 focus:border-everts/40 focus:bg-white focus:outline-none text-slate-600 placeholder-slate-300"
            />
            <span className="text-[10px] text-slate-300 flex-shrink-0">%</span>
          </div>
        </td>
      )
      case 'vp_eenh': return (
        <td key={id} className={tdBase}>
          {vpEenhEdit !== null ? (
            <input
              autoFocus
              type="number" step="0.01" min="0"
              value={vpEenhEdit}
              onChange={e => {
                setVpEenhEdit(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && compKpPe > 0) {
                  const pct = +((v / compKpPe - 1) * 100).toFixed(2)
                  onWijzig({ opslag_pct: pct })
                }
              }}
              onBlur={() => setVpEenhEdit(null)}
              className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none text-everts"
            />
          ) : (
            <span
              className="font-mono text-xs text-everts cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setVpEenhEdit(compVpPe === 0 ? '' : String(+compVpPe.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {compVpPe > 0 ? formatEuro(compVpPe) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'tot_vp': return (
        <td key={id} className={tdBase}>
          {totVpEdit !== null ? (
            <input
              autoFocus
              type="number" step="0.01" min="0"
              value={totVpEdit}
              onChange={e => {
                setTotVpEdit(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && compBedrag > 0) {
                  const pct = +((v / compBedrag - 1) * 100).toFixed(2)
                  onWijzig({ opslag_pct: pct })
                }
              }}
              onBlur={() => setTotVpEdit(null)}
              className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none font-bold text-everts"
            />
          ) : (
            <span
              className="font-mono text-xs text-everts font-bold cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setTotVpEdit(compVpTotaal === 0 ? '' : String(+compVpTotaal.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {compVpTotaal > 0 ? formatEuro(compVpTotaal) : <span className="text-slate-200">—</span>}
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
  const categorieen = getInstellingen().categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
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
            <div>Eenheid: <span className="font-mono text-slate-600">{regel.eenheid}</span></div>
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

interface RegelRijProps {
  regel: Calculatieregel
  componenten: Componentregel[]
  diepte: number
  defaultOpslag: number
  colOrder: ColId[]
  btwTarieven: number[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: string[]
  scenarioId: string
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onWijzigComponent: (id: string, type: Componentregel['type'], norm: number, tarief: number) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
  onVerwijderComponent: (compId: string) => void
  onVerwijder: () => void
  onHerlaad: () => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  isGeselecteerd?: boolean
  onSelecteer?: (ctrlKey: boolean, shiftKey: boolean) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
}

function CalculatieregelRij({
  regel, componenten, diepte, defaultOpslag, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId,
  onWijzig, onWijzigComponent, onWijzigComponentExtra, onVoegComponentToe, onVerwijderComponent, onVerwijder, onHerlaad,
  bibliotheekItems,
  isGeselecteerd, onSelecteer,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
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

  // Berekende waarden (op basis van lokale state)
  const tmpComps = [
    ...(!multiAb && (abUren > 0 || abTarief > 0) ? [{ id: 'ab', calculatieregel_id: regel.id, type: 'arbeid'         as const, norm_hoeveelheid: abUren, tarief: abTarief, opslag_pct: ab?.opslag_pct }] : allAb),
    ...(!multiMt && mtPrijs > 0                   ? [{ id: 'mt', calculatieregel_id: regel.id, type: 'materieel'      as const, norm_hoeveelheid: 1,      tarief: mtPrijs,  opslag_pct: mt?.opslag_pct }] : allMt),
    ...(!multiOa && oaPrijs > 0                   ? [{ id: 'oa', calculatieregel_id: regel.id, type: 'onderaanneming' as const, norm_hoeveelheid: 1,      tarief: oaPrijs,  opslag_pct: oa?.opslag_pct }] : allOa),
  ]
  const { arbeid_totaal, materieel_totaal, oa_totaal, kp_pe, kp_totaal, uren_pe, vp_pe, vp_totaal } =
    berekenCalculatieregel(regel, tmpComps, opslag)

  const hasCompOverride = regelComps.some(c => c.opslag_pct !== undefined)
  const displayOpslag = hasCompOverride && kp_pe > 0
    ? +((vp_pe / kp_pe - 1) * 100).toFixed(2)
    : opslag

  // Terugrekenen totaalprijs → eenheidsprijs
  const onBedragAb = (v: number) => {
    if (abUren > 0 && regel.hoeveelheid > 0) {
      const t = +(v / (abUren * regel.hoeveelheid)).toFixed(4)
      setAbTarief(t); deb('abt', () => onWijzigComponent(regel.id, 'arbeid', abUren, t))
    }
  }
  const onBedragMt = (v: number) => {
    if (regel.hoeveelheid > 0) {
      const t = +(v / regel.hoeveelheid).toFixed(4)
      setMtPrijs(t); deb('mt', () => onWijzigComponent(regel.id, 'materieel', 1, t))
    }
  }
  const onBedragOa = (v: number) => {
    if (regel.hoeveelheid > 0) {
      const t = +(v / regel.hoeveelheid).toFixed(4)
      setOaPrijs(t); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', 1, t))
    }
  }

  const [werkUitgeklapt,         setWerkUitgeklapt]         = useState(false)
  const [compsUitgeklapt,        setCompsUitgeklapt]        = useState(false)
  const [opmerkingOpen,          setOpmerkingOpen]          = useState(!!(regel.opmerking))
  const [schilderbehandelingOpen, setSchilderbehandelingOpen] = useState(!!(regel.schilderbehandeling))
  const [biblOpen,        setBiblOpen]        = useState(false)
  // Lokale edit-state voor totaalbedragen en verkoopprijzen
  const [mtBedragEdit, setMtBedragEdit] = useState<string | null>(null)
  const [oaBedragEdit, setOaBedragEdit] = useState<string | null>(null)
  const [vpEenhEdit,   setVpEenhEdit]   = useState<string | null>(null)
  const [totVpEdit,    setTotVpEdit]    = useState<string | null>(null)
  const [receptModalOpen, setReceptModalOpen] = useState(false)

  const indent = 4
  const isSP   = regel.is_stelpost ?? false
  const rowCls = regel.gemarkeerd ? 'bg-orange-50 italic' : ''

  const ni = (val: number, onChange: (v: number) => void, step = '0.01', decimals?: number) => (
    <input
      type="number" step={step} min="0"
      value={val === 0 ? '' : (decimals !== undefined ? +val.toFixed(decimals) : val)}
      className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent
        hover:bg-slate-50 hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none
        text-slate-700 placeholder-slate-200"
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
    />
  )

  const euro = (v: number, cls = 'text-slate-600') =>
    v !== 0
      ? <span className={`font-mono text-xs ${cls}`}>{formatEuro(v)}</span>
      : <span className="text-slate-200 text-xs">—</span>

  const renderCell = (id: ColId): React.ReactNode => {
    const col = COL_MAP[id]
    const base = `${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`

    switch (id) {
      case 'kostengroep': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          <input
            className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
              hover:bg-slate-100 hover:border hover:border-slate-200
              focus:bg-white focus:border focus:border-slate-300 focus:outline-none text-slate-500 placeholder:text-slate-300"
            value={regel.kostengroep ?? ''}
            placeholder="Groep..."
            maxLength={60}
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
            {isSP && <span className="text-[10px] text-amber-500 font-semibold flex-shrink-0">[STP]</span>}
            {regel.meetstaat_aggregaat_id && (
              <span
                className="flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-200 leading-none"
                title="Afkomstig uit meetstaat"
              >MS</span>
            )}
            <input
              className={`flex-1 min-w-0 text-xs px-1 py-1 rounded border-0 bg-transparent
                hover:bg-slate-50 hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-800
                ${regel.gemarkeerd ? 'italic' : ''}`}
              value={regel.omschrijving}
              placeholder="Omschrijving..."
              maxLength={150}
              onChange={e => onWijzig(regel.id, { omschrijving: e.target.value })}
            />
            <button
              onClick={() => setWerkUitgeklapt(v => !v)}
              className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                werkUitgeklapt || regel.werkomschrijving
                  ? 'text-everts bg-everts-50'
                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
              }`}
              title="Uitgebreide werkomschrijving"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            {/* Expand componentregels: rechts */}
            <button
              onClick={e => { e.stopPropagation(); setCompsUitgeklapt(v => !v) }}
              className={`flex-shrink-0 p-0.5 rounded transition-colors ${
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
            </button>
            {regel.opmerking && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Heeft interne opmerking" />
            )}
            {regel.schilderbehandeling && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Heeft schilderbehandeling" />
            )}
          </div>
        </td>
      )
      case 'aant': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="w-full text-xs text-right font-mono font-semibold px-1 py-0.5 block text-teal-600"
              title="Hoeveelheid vastgesteld door meetstaat — pas aan in de meetstaat"
            >
              {regel.hoeveelheid === 0 ? '—' : regel.hoeveelheid.toFixed(2)}
            </span>
          ) : (
            <input
              type="number" step="0.01" min="0"
              value={regel.hoeveelheid === 0 ? '' : +regel.hoeveelheid.toFixed(2)}
              className="w-full text-xs text-right font-mono font-semibold px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-slate-50 hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-800"
              onChange={e => onWijzig(regel.id, { hoeveelheid: parseFloat(e.target.value) || 0 })}
            />
          )}
        </td>
      )
      case 'eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="text-xs font-mono text-teal-600 font-semibold px-1 py-0.5 block"
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
              onChange={e => onWijzig(regel.id, { eenheid: e.target.value as Eenheid })}
            >
              {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
              {/* Toon huidige eenheid als die niet in de lijst staat */}
              {!eenheden.includes(regel.eenheid) && (
                <option key={regel.eenheid} value={regel.eenheid}>{regel.eenheid}</option>
              )}
            </select>
          )}
        </td>
      )
      case 'stelpost': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          <input
            type="checkbox"
            checked={isSP}
            onChange={e => onWijzig(regel.id, { is_stelpost: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
            title="Stelpost (provisorische som)"
          />
        </td>
      )
      case 'markeer': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
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
        <td key={id} className={`px-1 py-1 ${base}`}>
          {multiAb
            ? <span className="text-xs font-mono text-slate-400 block text-right px-1">{uren_pe > 0 ? formatGetal(uren_pe, 2) : ''}</span>
            : ni(abUren, onUrenChange, '0.01', 2)}
        </td>
      )
      case 'min_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {multiAb
            ? <span className="text-xs font-mono text-slate-400 block text-right px-1">{uren_pe > 0 ? formatGetal(uren_pe * 60, 2) : ''}</span>
            : ni(abMin, onMinChange, '0.01', 2)}
        </td>
      )
      case 'tarief_ab': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {multiAb
            ? <span className="text-xs font-mono text-slate-300 block text-right px-1">—</span>
            : ni(abTarief, onTariefAb, '0.01', 2)}
        </td>
      )
      case 'bedrag_ab': return <td key={id} className={`px-1 py-1 ${base}`}>{ni(arbeid_totaal, onBedragAb, '0.01', 2)}</td>
      case 'prijs_mt':  return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {multiMt
            ? <span className="text-xs font-mono text-slate-300 block text-right px-1">—</span>
            : ni(mtPrijs, v => { setMtPrijs(v); deb('mt', () => onWijzigComponent(regel.id, 'materieel', 1, v)) }, '0.01', 2)}
        </td>
      )
      case 'bedrag_mt': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          <input
            type="number" step="0.01" min="0"
            value={mtBedragEdit !== null ? mtBedragEdit : (materieel_totaal === 0 ? '' : +materieel_totaal.toFixed(2))}
            onFocus={() => setMtBedragEdit(materieel_totaal === 0 ? '' : String(+materieel_totaal.toFixed(2)))}
            onChange={e => {
              setMtBedragEdit(e.target.value)
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && regel.hoeveelheid > 0) {
                const t = +(v / regel.hoeveelheid).toFixed(4)
                setMtPrijs(t); deb('mt', () => onWijzigComponent(regel.id, 'materieel', 1, t))
              }
            }}
            onBlur={() => setMtBedragEdit(null)}
            className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'prijs_oa':  return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {multiOa
            ? <span className="text-xs font-mono text-slate-300 block text-right px-1">—</span>
            : ni(oaPrijs, v => { setOaPrijs(v); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', 1, v)) }, '0.01', 2)}
        </td>
      )
      case 'bedrag_oa': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          <input
            type="number" step="0.01" min="0"
            value={oaBedragEdit !== null ? oaBedragEdit : (oa_totaal === 0 ? '' : +oa_totaal.toFixed(2))}
            onFocus={() => setOaBedragEdit(oa_totaal === 0 ? '' : String(+oa_totaal.toFixed(2)))}
            onChange={e => {
              setOaBedragEdit(e.target.value)
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && regel.hoeveelheid > 0) {
                const t = +(v / regel.hoeveelheid).toFixed(4)
                setOaPrijs(t); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', 1, t))
              }
            }}
            onBlur={() => setOaBedragEdit(null)}
            className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'kp_eenh': return (
        <td key={id} className={`px-2 py-1 ${base}`}>{euro(kp_pe)}</td>
      )
      case 'tot_kp': return (
        <td key={id} className={`px-2 py-1 ${base}`}>{euro(kp_totaal, 'text-everts-dark font-semibold')}</td>
      )
      case 'opslag_pct': return (
        <td key={id} className={`px-2 py-1 ${base}`}>
          <div className="flex items-center justify-start gap-0.5">
            <input
              type="number" step="0.01" min="0"
              value={displayOpslag === 0 ? '' : +displayOpslag.toFixed(2)}
              placeholder={defaultOpslag.toFixed(2)}
              className="w-12 text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-white hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
              onChange={e => {
                const v = parseFloat(e.target.value) || 0
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
        <td key={id} className={`px-1 py-1 ${base}`}>
          {vpEenhEdit !== null ? (
            <input
              autoFocus
              type="number" step="0.01" min="0"
              value={vpEenhEdit}
              onChange={e => {
                setVpEenhEdit(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && kp_pe > 0) {
                  const pct = +((v / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setVpEenhEdit(null)}
              className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none text-everts"
            />
          ) : (
            <span
              className="font-mono text-xs text-everts cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setVpEenhEdit(vp_pe === 0 ? '' : String(+vp_pe.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_pe > 0 ? formatEuro(vp_pe) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'tot_vp': return (
        <td key={id} className={`px-1 py-1 ${base}`}>
          {totVpEdit !== null ? (
            <input
              autoFocus
              type="number" step="0.01" min="0"
              value={totVpEdit}
              onChange={e => {
                setTotVpEdit(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && kp_pe > 0 && regel.hoeveelheid > 0) {
                  const vpPe = v / regel.hoeveelheid
                  const pct = +((vpPe / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setTotVpEdit(null)}
              className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none font-bold text-everts"
            />
          ) : (
            <span
              className="font-mono text-xs text-everts font-bold cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setTotVpEdit(vp_totaal === 0 ? '' : String(+vp_totaal.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_totaal > 0 ? formatEuro(vp_totaal) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'btw_pct': return (
        <td key={id} className={`px-2 py-1 ${base}`}>
          <select
            value={regel.btw_pct ?? ''}
            onChange={e => onWijzig(regel.id, { btw_pct: e.target.value !== '' ? parseInt(e.target.value) : undefined })}
            className="w-full text-xs font-mono text-right px-1 py-0.5 rounded border-0 bg-transparent
              hover:bg-white hover:border hover:border-slate-200
              focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          >
            <option value="">—</option>
            {btwTarieven.map(t => <option key={t} value={t}>{t}%</option>)}
          </select>
        </td>
      )
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
          'group border-b border-slate-100 hover:bg-slate-50/40 transition-colors',
          rowCls,
          isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
          isDragging ? 'opacity-40' : '',
          isDragOver ? 'border-t-2 border-t-everts' : ''
        )}
        draggable={!!onDragStart}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
        onDragOver={onDragOver}
        onDrop={e => { e.preventDefault(); onDrop?.() }}
        onDragEnd={onDragEnd}
        onMouseDown={e => {
          if ((e.ctrlKey || e.metaKey || e.shiftKey) && !(e.target as HTMLElement).closest('input,select,textarea,button')) {
            e.preventDefault()
            onSelecteer?.(e.ctrlKey || e.metaKey, e.shiftKey)
          }
        }}
        style={{ cursor: onDragStart ? 'grab' : undefined }}
      >
        {colOrder.map(id => renderCell(id))}
      </tr>
      {werkUitgeklapt && (
        <tr className={`border-b border-slate-100 ${regel.gemarkeerd ? 'bg-orange-50/60' : 'bg-slate-50/30'}`}>
          <td colSpan={colOrder.length} className="pb-2 pt-1 space-y-2" style={{ paddingLeft: `${indent + 8}px`, paddingRight: '12px' }}>
            <textarea
              autoFocus
              value={regel.werkomschrijving ?? ''}
              onChange={e => onWijzig(regel.id, { werkomschrijving: e.target.value })}
              placeholder="Uitgebreide werkomschrijving..."
              rows={3}
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white
                focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20
                resize-none text-slate-600 placeholder-slate-300"
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
              regelHoeveelheid={regel.hoeveelheid}
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
                    schilderbehandelingOpen || regel.schilderbehandeling
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
                <div className="flex items-center gap-2">
                  <PaintBucket className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={regel.schilderbehandeling ?? ''}
                    placeholder="Schilderbehandeling (bv. grondverf + 2× lakverf glans wit)..."
                    className="flex-1 text-xs px-2 py-1.5 border border-blue-200 rounded bg-white
                      focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100
                      text-slate-700 placeholder-slate-300"
                    onChange={e => onWijzig(regel.id, { schilderbehandeling: e.target.value || undefined })}
                  />
                  {regel.schilderbehandeling && (
                    <button
                      onClick={() => { onWijzig(regel.id, { schilderbehandeling: undefined }); setSchilderbehandelingOpen(false) }}
                      className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
                      title="Behandeling verwijderen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
  btwTarieven: number[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: string[]
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
  onVoegRegelToe: (groepId: string) => void
  onVoegSubgroepToe: (groep: Groep) => void
  dragOverGroepId: string | null
  onDragStart: (groep: Groep) => void
  onDragOver: (e: React.DragEvent, groep: Groep) => void
  onDrop: (e: React.DragEvent, doelGroep: Groep) => void
  onDragEnd: () => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  geselecteerdeRegels?: Set<string>
  onSelecteerRegel?: (regelId: string, ctrlKey: boolean, shiftKey: boolean) => void
}

function GroepSectie({
  groep, diepte, alleGroepen, alleRegels, alleComponenten, nummers,
  isActief, defaultOpslag, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId, onHerlaad,
  onKlik, onRegelWijzig, onRegelComponentWijzig, onWijzigComponentExtra,
  onVoegComponentToe, onVerwijderComponent,
  onVerwijderRegel, onVerwijderGroep, onWijzigGroep, onVoegRegelToe, onVoegSubgroepToe,
  dragOverGroepId, onDragStart, onDragOver, onDrop, onDragEnd,
  bibliotheekItems,
  geselecteerdeRegels, onSelecteerRegel,
}: GroepSectieProps) {
  const [ingeklapt,       setIngeklapt]       = useState(groep.ingeklapt ?? false)
  const [confirmVerwijder, setConfirmVerwijder] = useState(false)
  const [dragRegelId,     setDragRegelId]     = useState<string | null>(null)
  const [dragOverRegelId, setDragOverRegelId] = useState<string | null>(null)
  const directeRegels = alleRegels.filter(r => r.groep_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const subGroepen    = alleGroepen.filter(g => g.parent_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const kostprijs     = berekenGroepKostprijs(groep.id, alleGroepen, alleRegels, alleComponenten)
  const nummer        = nummers.get(groep.id) ?? ''
  const isDragOver    = dragOverGroepId === groep.id
  const colCount      = colOrder.length

  const handleRegelDragStart = (_e: React.DragEvent, id: string) => setDragRegelId(id)
  const handleRegelDragOver  = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (dragRegelId && dragRegelId !== id) setDragOverRegelId(id)
  }
  const handleRegelDrop = (targetId: string) => {
    if (!dragRegelId || dragRegelId === targetId) { setDragRegelId(null); setDragOverRegelId(null); return }
    const gesorteerd = [...directeRegels]
    const vanIdx = gesorteerd.findIndex(r => r.id === dragRegelId)
    const naarIdx = gesorteerd.findIndex(r => r.id === targetId)
    if (vanIdx === -1 || naarIdx === -1) { setDragRegelId(null); setDragOverRegelId(null); return }
    gesorteerd.splice(naarIdx, 0, gesorteerd.splice(vanIdx, 1)[0])
    gesorteerd.forEach((r, i) => { if (r.volgorde !== i + 1) onRegelWijzig(r.id, { volgorde: i + 1 }) })
    setDragRegelId(null); setDragOverRegelId(null)
  }
  const handleRegelDragEnd = () => { setDragRegelId(null); setDragOverRegelId(null) }

  const kopStijlen = [
    'bg-everts-dark text-white',
    'bg-everts/10 text-everts-dark border-b border-everts/20',
    'bg-slate-100 text-slate-700 border-b border-slate-200',
  ]
  const kopStijl   = kopStijlen[diepte] ?? kopStijlen[2]
  const kopPadding = diepte === 0 ? 'py-2.5' : 'py-1.5'
  const kopTekst   = diepte === 0 ? 'text-sm font-bold' : diepte === 1 ? 'text-xs font-semibold' : 'text-xs font-medium'
  const indent     = 4

  return (
    <>
      {isDragOver && (
        <tr><td colSpan={colCount}><div className="h-0.5 bg-everts mx-2 rounded" /></td></tr>
      )}

      <tr
        id={`groepkop-${groep.id}`}
        draggable
        className={`border-b cursor-pointer group/kop select-none ${kopStijl} ${isActief ? 'ring-1 ring-inset ring-everts/50' : ''}`}
        onClick={() => onKlik(groep.id)}
        onDragStart={() => onDragStart(groep)}
        onDragOver={e => onDragOver(e, groep)}
        onDrop={e => onDrop(e, groep)}
        onDragEnd={onDragEnd}
      >
        <td colSpan={colCount} className={kopPadding} style={{ paddingLeft: `${indent}px` }}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] opacity-30 cursor-grab select-none ${diepte === 0 ? 'text-white' : 'text-slate-400'}`}>⠿</span>
            <button
              onClick={e => { e.stopPropagation(); setIngeklapt(v => !v) }}
              className={`p-0.5 rounded ${diepte === 0 ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {ingeklapt ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <span className={`font-mono opacity-50 text-[11px] ${diepte === 0 ? 'text-white' : ''}`}>{nummer}</span>
            <span className={`${kopTekst} ${groep.optioneel ? 'italic opacity-60' : ''}`}>{groep.naam}</span>
            {groep.optioneel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-300 font-medium">
                optioneel
              </span>
            )}
            <span className={`text-[11px] opacity-50 ${diepte === 0 ? 'text-white' : 'text-slate-500'}`}>
              {directeRegels.length > 0 && `${directeRegels.length} regel${directeRegels.length !== 1 ? 's' : ''}`}
              {subGroepen.length > 0 && ` · ${subGroepen.length} subgroep${subGroepen.length !== 1 ? 'en' : ''}`}
            </span>
            <div className="flex-1" />
            {kostprijs > 0 && (() => {
              const groepVP = berekenGroepVP(groep.id, alleGroepen, alleRegels, alleComponenten, defaultOpslag)
              return (
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs ${diepte === 0 ? 'text-white/70' : 'text-slate-500'}`}>
                    KP: {formatEuro(kostprijs)}
                  </span>
                  <span className={`font-mono text-xs font-semibold ${diepte === 0 ? 'text-white' : 'text-everts'}`}>
                    VP: {formatEuro(groepVP)}
                  </span>
                </div>
              )
            })()}
            <div className="opacity-0 group-hover/kop:opacity-100 flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onWijzigGroep(groep.id, { optioneel: !groep.optioneel })}
                title={groep.optioneel ? 'Optioneel: telt niet mee in eindtotaal' : 'Markeer als optioneel'}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  groep.optioneel
                    ? 'border-amber-400 text-amber-600 bg-amber-50'
                    : diepte === 0 ? 'border-white/30 text-white/50 hover:border-white/60 hover:text-white/80' : 'border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-600'
                }`}
              >
                OPT
              </button>
              <button
                onClick={() => onVoegRegelToe(groep.id)}
                className={`text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte === 0 ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-everts hover:bg-everts-50'}`}
              >
                <Plus className="w-3 h-3" /> Regel
              </button>
              {groep.niveau < 3 && (
                <button
                  onClick={() => onVoegSubgroepToe(groep)}
                  className={`text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte === 0 ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-everts hover:bg-everts-50'}`}
                >
                  <Plus className="w-3 h-3" /> Groep
                </button>
              )}
              <button
                onClick={() => setConfirmVerwijder(true)}
                className={`p-1 rounded ${diepte === 0 ? 'text-white/40 hover:text-red-300' : 'text-slate-300 hover:text-red-500'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </td>
      </tr>

      {!ingeklapt && (
        <>
          {directeRegels.map(r => (
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
              isGeselecteerd={geselecteerdeRegels?.has(r.id)}
              onSelecteer={(ctrl, shift) => onSelecteerRegel?.(r.id, ctrl, shift)}
              isDragging={dragRegelId === r.id}
              isDragOver={dragOverRegelId === r.id}
              onDragStart={e => handleRegelDragStart(e, r.id)}
              onDragOver={e => handleRegelDragOver(e, r.id)}
              onDrop={() => handleRegelDrop(r.id)}
              onDragEnd={handleRegelDragEnd}
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
              onWijzigGroep={onWijzigGroep}
              onVoegRegelToe={onVoegRegelToe} onVoegSubgroepToe={onVoegSubgroepToe}
              dragOverGroepId={dragOverGroepId} onDragStart={onDragStart}
              onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
              bibliotheekItems={bibliotheekItems}
              geselecteerdeRegels={geselecteerdeRegels}
              onSelecteerRegel={onSelecteerRegel}
            />
          ))}

        </>
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
  { scenarioId, scenario, actiefGroepId, onGroepActief, onWijziging, onUndoCountChange, bibliotheekItems = [] },
  ref
) {
  const [groepen,     setGroepen]     = useState<Groep[]>([])
  const [regels,      setRegels]      = useState<Calculatieregel[]>([])
  const [componenten, setComponenten] = useState<Componentregel[]>([])
  const [nummers,     setNummers]     = useState<Map<string, string>>(new Map())
  const [nieuwGroepParent, setNieuwGroepParent] = useState<Groep | null>(null)
  const [nieuwGroepNaam,   setNieuwGroepNaam]   = useState('')

  // Selectie
  const [geselecteerdeRegels, setGeselecteerdeRegels] = useState<Set<string>>(new Set())

  // Klembord (cut/copy/paste)
  const klembordRef = useRef<{ regels: Calculatieregel[]; componenten: Componentregel[] } | null>(null)

  // Move-to-group modal
  const [verplaatsModalOpen, setVerplaatsModalOpen] = useState(false)

  // Undo history
  const historyRef = useRef<Snapshot[]>([])

  // Groep drag & drop
  const [sleepGroep, setSleepGroep] = useState<Groep | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Instellingen
  const [btwTarieven] = useState<number[]>(() => getInstellingen().btw_tarieven)
  const [kolomNamen]  = useState<Record<string, string>>(() => (getInstellingen().kolom_namen ?? {}) as Record<string, string>)
  const [uurtarieven] = useState(() => getInstellingen().uurtarieven ?? [])
  const [eenheden]    = useState<string[]>(() => getInstellingen().eenheden ?? Array.from(EENHEDEN))

  // Kolom breedte + volgorde
  const [colWidths, setColWidths] = useState<Record<ColId, number>>(DEFAULT_WIDTHS)
  const [colOrder,  setColOrder]  = useState<ColId[]>(DEFAULT_ORDER)
  const [dragCol,     setDragCol]     = useState<ColId | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColId | null>(null)
  const resizeRef = useRef<{ col: ColId; startX: number; startW: number } | null>(null)

  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico

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

  const collapseAll = useCallback(() => {
    const bijgewerkt = groepen.map(g => ({ ...g, ingeklapt: true }))
    bijgewerkt.forEach(g => slaGroepOp(g))
    setGroepen(bijgewerkt)
  }, [groepen])

  useImperativeHandle(ref, () => ({ undo, collapseAll }), [undo, collapseAll])

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
      const ctrl = e.ctrlKey || e.metaKey
      const tag  = (e.target as HTMLElement).tagName
      const inVeld = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)

      // Browser-shortcuts altijd blokkeren (ook als focus in invoerveld)
      if (ctrl && !e.shiftKey && e.key === 'r') {
        e.preventDefault()
        if (inVeld) return
        if (actiefGroepId) {
          handleVoegRegelToe(actiefGroepId)
        } else {
          toast('Selecteer eerst een groep', { icon: 'ℹ️' })
        }
        return
      }
      if (ctrl && !e.shiftKey && e.key === 'g') {
        e.preventDefault()
        if (inVeld) return
        voegRootGroepToe()
        return
      }

      // Overige shortcuts: skip als focus in invoerveld
      if (inVeld) return

      // Ctrl+Z → Undo
      if (ctrl && e.key === 'z') {
        e.preventDefault(); undo(); return
      }
      // Escape → deselecteer
      if (e.key === 'Escape') {
        setGeselecteerdeRegels(new Set()); return
      }

      // Ctrl+C → kopieer geselecteerde regels naar klembord
      if (ctrl && !e.shiftKey && e.key === 'c' && geselecteerdeRegels.size > 0) {
        e.preventDefault()
        const ids = Array.from(geselecteerdeRegels)
        klembordRef.current = {
          regels:     regels.filter(r => ids.includes(r.id)),
          componenten: componenten.filter(c => ids.includes(c.calculatieregel_id)),
        }
        toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} gekopieerd naar klembord`)
        return
      }
      // Ctrl+X → knip geselecteerde regels (naar klembord + verwijder)
      if (ctrl && !e.shiftKey && e.key === 'x' && geselecteerdeRegels.size > 0) {
        e.preventDefault()
        const ids = Array.from(geselecteerdeRegels)
        klembordRef.current = {
          regels:     regels.filter(r => ids.includes(r.id)),
          componenten: componenten.filter(c => ids.includes(c.calculatieregel_id)),
        }
        handleVerwijderGeselecteerd()
        toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} geknipt`)
        return
      }
      // Ctrl+V → plak regels uit klembord in actieve groep
      if (ctrl && !e.shiftKey && e.key === 'v') {
        e.preventDefault()
        if (!klembordRef.current || klembordRef.current.regels.length === 0) {
          toast('Klembord is leeg', { icon: 'ℹ️' })
          return
        }
        const doelGroepId = actiefGroepId ?? klembordRef.current.regels[0].groep_id
        duwSnapshot()
        const geplakteIds: string[] = []
        klembordRef.current.regels.forEach(orig => {
          const nieuweRegelId = nieuweId()
          const kopie: Calculatieregel = {
            ...orig, id: nieuweRegelId, groep_id: doelGroepId,
            volgorde: regels.filter(r => r.groep_id === doelGroepId).length + geplakteIds.length + 1,
          }
          slaCalculatieregelOp(kopie)
          klembordRef.current!.componenten
            .filter(c => c.calculatieregel_id === orig.id)
            .forEach(comp => slaComponentregelOp({ ...comp, id: nieuweId(), calculatieregel_id: nieuweRegelId }))
          geplakteIds.push(nieuweRegelId)
        })
        laadAlles(); onWijziging()
        setGeselecteerdeRegels(new Set(geplakteIds))
        toast.success(`${geplakteIds.length} regel${geplakteIds.length !== 1 ? 's' : ''} geplakt`)
        return
      }

      // Alleen door als er regels geselecteerd zijn
      if (geselecteerdeRegels.size === 0) return

      // Delete / Backspace → verwijder geselecteerde regels
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); handleVerwijderGeselecteerd(); return
      }
      // Ctrl+Shift+R → verwijder geselecteerde regels
      if (ctrl && e.shiftKey && e.key === 'R') {
        e.preventDefault(); handleVerwijderGeselecteerd(); return
      }
      // Ctrl+D → dupliceer geselecteerde regels
      if (ctrl && e.key === 'd') {
        e.preventDefault(); handleKopieerRegels(); return
      }
      // Ctrl+M → verplaats naar andere groep
      if (ctrl && e.key === 'm') {
        e.preventDefault(); setVerplaatsModalOpen(true); return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, geselecteerdeRegels, actiefGroepId, regels, componenten, duwSnapshot, laadAlles, onWijziging])

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
    })
    laadAlles(); onWijziging()
    setVerplaatsModalOpen(false)
    setGeselecteerdeRegels(new Set())
    toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} verplaatst`)
  }, [geselecteerdeRegels, regels, duwSnapshot, laadAlles, onWijziging])

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

  // ─── Rij drag & drop ───────────────────────────────────────────────────────
  const handleDragStart = useCallback((g: Groep) => setSleepGroep(g), [])
  const handleDragEnd   = useCallback(() => { setSleepGroep(null); setDragOverId(null) }, [])
  const handleDragOver  = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (!sleepGroep || sleepGroep.id === doel.id || sleepGroep.parent_id !== doel.parent_id) return
    setDragOverId(doel.id)
  }, [sleepGroep])
  const handleDrop = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (!sleepGroep || sleepGroep.id === doel.id || sleepGroep.parent_id !== doel.parent_id) {
      setSleepGroep(null); setDragOverId(null); return
    }
    const siblings = groepen.filter(g => g.parent_id === sleepGroep.parent_id).sort((a, b) => a.volgorde - b.volgorde)
    const fi = siblings.findIndex(g => g.id === sleepGroep.id)
    const ti = siblings.findIndex(g => g.id === doel.id)
    const nieuw = [...siblings]; nieuw.splice(fi, 1); nieuw.splice(ti, 0, sleepGroep)
    nieuw.forEach((g, i) => slaGroepOp({ ...g, volgorde: i + 1 }))
    laadAlles(); onWijziging()
    setSleepGroep(null); setDragOverId(null)
    toast.success('Volgorde bijgewerkt')
  }, [sleepGroep, groepen, laadAlles, onWijziging])

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
    const nieuw: Calculatieregel = { id: nieuweId(), groep_id: groepId, omschrijving: '', hoeveelheid: 1, eenheid: 'st', volgorde, btw_pct: scenario.btw_pct_default ?? undefined }
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
    const naam = prompt('Naam nieuwe groep:')
    if (!naam?.trim()) return
    const nieuw: Groep = {
      id: nieuweId(), scenario_id: scenarioId, parent_id: null,
      naam: naam.trim(), niveau: 1,
      volgorde: groepen.filter(g => g.parent_id === null).length + 1,
    }
    slaGroepOp(nieuw); laadAlles(); onWijziging()
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
  const totaalKP = berekenScenarioKostprijs(groepenZonderOptioneel, regels, componenten)
  const totaalVP = berekenScenarioVP(groepenZonderOptioneel, regels, componenten, defaultOpslag)
  const marge_pct = totaalVP > 0 ? ((totaalVP - totaalKP) / totaalVP) * 100 : 0
  const roots    = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)
  const totalW   = colOrder.reduce((s, id) => s + colWidths[id], 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

      {/* Sub-header: totalen + actie */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
        {geselecteerdeRegels.size > 0 ? (
          <>
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
          </>
        ) : totaalKP > 0 ? (
          <>
            <span className="text-xs text-slate-500">KP: <span className="font-semibold text-slate-700 font-mono">{formatEuro(totaalKP)}</span></span>
            <span className="text-slate-300 text-xs">·</span>
            <span className="text-xs font-semibold text-everts">VP: <span className="font-mono">{formatEuro(totaalVP)}</span></span>
            <span className="text-slate-300 text-xs">·</span>
            <span className={`text-xs font-semibold ${marge_pct >= 20 ? 'text-everts' : marge_pct >= 12 ? 'text-amber-500' : 'text-red-500'}`}>
              Marge: {formatPct(marge_pct)}
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-400">Geen calculatieregels</span>
        )}
        <div className="flex-1" />
        <button
          onClick={voegRootGroepToe}
          className="inline-flex items-center gap-1.5 bg-everts hover:bg-everts-dark text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Groep toevoegen
        </button>
      </div>

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

      {/* Tabel */}
      <div className="flex-1 overflow-auto min-h-0">
        {roots.length > 0 ? (
          <table className="border-collapse text-sm w-full" style={{ tableLayout: 'fixed', minWidth: `${totalW}px` }}>
            <colgroup>
              {colOrder.map(id => <col key={id} style={{ width: colWidths[id] }} />)}
            </colgroup>
            <TabelHeader
              colOrder={colOrder} colWidths={colWidths} kolomNamen={kolomNamen}
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
                  defaultOpslag={defaultOpslag} colOrder={colOrder} btwTarieven={btwTarieven}
                  uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={laadAlles}
                  onKlik={onGroepActief}
                  onRegelWijzig={handleRegelWijzig}
                  onRegelComponentWijzig={handleComponentWijzig}
                  onWijzigComponentExtra={handleWijzigComponentExtra}
                  onVoegComponentToe={handleVoegComponentToe}
                  onVerwijderComponent={handleVerwijderComponent}
                  onVerwijderRegel={handleVerwijderRegel}
                  onVerwijderGroep={handleVerwijderGroep}
                  onWijzigGroep={handleWijzigGroep}
                  onVoegRegelToe={handleVoegRegelToe}
                  onVoegSubgroepToe={handleVoegSubgroepToe}
                  dragOverGroepId={dragOverId}
                  onDragStart={handleDragStart} onDragOver={handleDragOver}
                  onDrop={handleDrop} onDragEnd={handleDragEnd}
                  bibliotheekItems={bibliotheekItems}
                  geselecteerdeRegels={geselecteerdeRegels}
                  onSelecteerRegel={handleSelecteerRegel}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                {colOrder.map(id => {
                  if (id === 'omschrijving') return (
                    <td key={id} className="px-3 py-3 text-sm font-bold text-slate-700">Totaal calculatie</td>
                  )
                  if (id === 'tot_kp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50">
                      <span className="font-mono text-base font-bold text-everts-dark">{formatEuro(totaalKP)}</span>
                    </td>
                  )
                  if (id === 'tot_vp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50/80">
                      <span className="font-mono text-base font-bold text-everts">{formatEuro(totaalVP)}</span>
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
      </div>

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
                    {nummer && <span className="font-mono text-slate-400 text-[10px]">{nummer}</span>}
                    <span className="truncate">{g.naam}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default CalculatieGrid
