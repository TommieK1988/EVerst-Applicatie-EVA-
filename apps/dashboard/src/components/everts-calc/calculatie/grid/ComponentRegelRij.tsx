'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { formatEuro, formatGetal, parseGetal } from '@/lib/everts-calc/calculations'
import type { Componentregel, Eenheid, EenheidConfig } from '@/lib/everts-calc/types'
import { type ColId, COL_MAP } from './kolommen'
import { GetalInput } from './GetalInput'

// ─── ComponentRegelRij ───────────────────────────────────────────────────────

export function ComponentRegelRij({
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
        <td
          key={id}
          className={tdBase}
          style={comp.type === 'arbeid' && normEdit !== 0 && !tariefEdit ? { ...tdSt, backgroundColor: '#fef3c7' } : tdSt}
          title={comp.type === 'arbeid' && normEdit !== 0 && !tariefEdit ? 'Uren zonder uurtarief — deze detailregel telt voor € 0 mee.' : undefined}
        >
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
