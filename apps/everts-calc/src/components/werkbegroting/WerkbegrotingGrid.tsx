'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, Trash2, Plus, History } from 'lucide-react'
import {
  getGroepen, getWerkbegrotingRegels, getWerkbegrotingComponenten,
  slaWerkbegrotingRegelOp, slaWerkbegrotingComponentOp, verwijderWerkbegrotingComponent,
  voegWijzigingToe, getCalculatieregels, getComponentregels,
} from '@/lib/local-store'
import { berekenWerkbegrotingRegel, vergelijkMetCalculatie, formatEuro, formatGetal } from '@/lib/calculations'
import { nieuweId } from '@/lib/utils'
import type { Groep, WerkbegrotingRegel, WerkbegrotingComponent, WerkbegrotingWijziging, Eenheid } from '@/lib/types'
import { EENHEDEN } from '@/lib/types'
import WijzigingenSidebar from './WijzigingenSidebar'
import RelatieZoekveld from './RelatieZoekveld'
import BulkBewerkPanel from './BulkBewerkPanel'
import BestellingModal from './BestellingModal'

interface Props {
  werkbegrotingId: string
  scenarioId: string
  onWijziging: () => void
}

export default function WerkbegrotingGrid({ werkbegrotingId, scenarioId, onWijziging }: Props) {
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [regels, setRegels] = useState<WerkbegrotingRegel[]>([])
  const [componenten, setComponenten] = useState<WerkbegrotingComponent[]>([])
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set())
  const [uitgebreid, setUitgebreid] = useState<Set<string>>(new Set())
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set())  // component IDs
  const [sidebarRegelId, setSidebarRegelId] = useState<string | null>(null)
  const [bestellingOpen, setBestellingOpen] = useState(false)

  const laad = useCallback(() => {
    setGroepen(getGroepen(scenarioId))
    setRegels(getWerkbegrotingRegels(werkbegrotingId))
    setComponenten(getWerkbegrotingComponenten())
  }, [werkbegrotingId, scenarioId])

  useEffect(() => { laad() }, [laad])

  const onRegelWijzig = useCallback((regelId: string, patch: Partial<WerkbegrotingRegel>) => {
    const regel = regels.find(r => r.id === regelId)
    if (!regel) return
    const bijgewerkt = { ...regel, ...patch }
    slaWerkbegrotingRegelOp(bijgewerkt)
    setRegels(prev => prev.map(r => r.id === regelId ? bijgewerkt : r))
    onWijziging()
  }, [regels, onWijziging])

  const onComponentWijzig = useCallback((compId: string, patch: Partial<WerkbegrotingComponent>) => {
    const comp = componenten.find(c => c.id === compId)
    if (!comp) return

    // Audittrail per gewijzigd veld
    const userId = null  // TODO: user_id uit auth context
    for (const [veld, nieuweWaarde] of Object.entries(patch)) {
      const oudeWaarde = (comp as unknown as Record<string, unknown>)[veld]
      if (oudeWaarde === nieuweWaarde) continue
      const wijziging: WerkbegrotingWijziging = {
        id: nieuweId(),
        werkbegroting_id: werkbegrotingId,
        werkbegroting_regel_id: comp.werkbegroting_regel_id,
        component_id: compId,
        veld,
        oude_waarde: oudeWaarde !== undefined ? String(oudeWaarde) : null,
        nieuwe_waarde: nieuweWaarde !== undefined ? String(nieuweWaarde) : null,
        user_id: userId,
        aangemaakt_op: new Date().toISOString(),
      }
      voegWijzigingToe(wijziging)
    }

    const bijgewerkt = { ...comp, ...patch }
    slaWerkbegrotingComponentOp(bijgewerkt)
    setComponenten(prev => prev.map(c => c.id === compId ? bijgewerkt : c))
    onWijziging()
  }, [componenten, werkbegrotingId, onWijziging])

  const voegComponentToe = useCallback((regelId: string, type: WerkbegrotingComponent['type']) => {
    const nieuw: WerkbegrotingComponent = {
      id: nieuweId(),
      werkbegroting_regel_id: regelId,
      source_component_id: null,
      type,
      norm_hoeveelheid: type === 'arbeid' ? 0 : 1,
      tarief: 0,
    }
    slaWerkbegrotingComponentOp(nieuw)
    setComponenten(prev => [...prev, nieuw])
    onWijziging()
  }, [onWijziging])

  const verwijderComp = useCallback((compId: string) => {
    verwijderWerkbegrotingComponent(compId)
    setComponenten(prev => prev.filter(c => c.id !== compId))
    onWijziging()
  }, [onWijziging])

  const toggleSelecteer = useCallback((compId: string) => {
    setGeselecteerd(prev => {
      const nieuw = new Set(prev)
      nieuw.has(compId) ? nieuw.delete(compId) : nieuw.add(compId)
      return nieuw
    })
  }, [])

  // Groepen op niveau 1 + hun kinderen
  const toplevelGroepen = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)

  const renderGroep = (groep: Groep, niveau: number): React.ReactNode => {
    const kinderen = groepen.filter(g => g.parent_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
    const groepRegels = regels.filter(r => r.groep_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
    const isIngeklapt = ingeklapt.has(groep.id)

    return (
      <div key={groep.id}>
        {/* Groepheader */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none border-b border-slate-100
            ${niveau === 0 ? 'bg-slate-100 font-semibold text-slate-700' : 'bg-slate-50 text-slate-600 text-sm'}`}
          style={{ paddingLeft: `${12 + niveau * 16}px` }}
          onClick={() => setIngeklapt(prev => { const n = new Set(prev); n.has(groep.id) ? n.delete(groep.id) : n.add(groep.id); return n })}
        >
          {isIngeklapt ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate">{groep.naam}</span>
        </div>

        {!isIngeklapt && (
          <>
            {/* Kostengroepen binnen deze groep */}
            {renderKostengroepen(groepRegels, groep.id)}
            {/* Subgroepen */}
            {kinderen.map(k => renderGroep(k, niveau + 1))}
          </>
        )}
      </div>
    )
  }

  const renderKostengroepen = (groepRegels: WerkbegrotingRegel[], _groepId: string) => {
    // Groepeer regels per kostengroep (behoud volgorde)
    const kostengroepenGezien = new Set<string>()
    const geordend: { label: string | null; regels: WerkbegrotingRegel[] }[] = []

    for (const r of groepRegels) {
      const label = r.kostengroep || null
      const key = label ?? '__geen__'
      if (!kostengroepenGezien.has(key)) {
        kostengroepenGezien.add(key)
        geordend.push({ label, regels: [] })
      }
      geordend[geordend.length - 1].regels.push(r)
    }

    return geordend.map(({ label, regels: kg_regels }) => (
      <div key={label ?? '_geen'}>
        {label && (
          <div className="px-4 py-1 text-xs font-semibold text-slate-500 bg-slate-50/80 border-b border-slate-100 uppercase tracking-wide">
            {label}
          </div>
        )}
        {kg_regels.map(r => renderRegel(r))}
      </div>
    ))
  }

  const renderRegel = (regel: WerkbegrotingRegel) => {
    const regelComps = componenten.filter(c => c.werkbegroting_regel_id === regel.id)
    const isUitgebreid = uitgebreid.has(regel.id)
    const { kp_totaal: wbKP } = berekenWerkbegrotingRegel(regel, regelComps)

    // Vergelijk met originele calculatie
    const origRegel = getCalculatieregels(regel.groep_id).find(r => r.id === regel.source_calculatieregel_id)
    const origComps = origRegel ? getComponentregels(origRegel.id) : []
    const vergelijking = origRegel
      ? vergelijkMetCalculatie(regel, regelComps, origRegel, origComps)
      : null

    return (
      <div key={regel.id} className={`border-b border-slate-100 ${regel.is_stelpost ? 'bg-amber-50/30' : ''}`}>
        {/* Regelrij */}
        <div className="flex items-center gap-0 hover:bg-slate-50/50 group" style={{ minHeight: '32px' }}>
          {/* Expand componenten */}
          <button
            className="flex-shrink-0 w-7 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
            onClick={() => setUitgebreid(prev => { const n = new Set(prev); n.has(regel.id) ? n.delete(regel.id) : n.add(regel.id); return n })}
            title="Componentregels tonen"
          >
            {isUitgebreid ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {/* Omschrijving */}
          <div className="flex-1 min-w-0 px-2 py-1">
            <span className="text-xs text-slate-700 truncate block">{regel.omschrijving || <span className="text-slate-300">—</span>}</span>
          </div>

          {/* Hoeveelheid (LOCKED) */}
          <div className="flex-shrink-0 w-16 px-2 text-right">
            <span
              className="text-xs font-mono text-teal-600 font-semibold"
              title="Hoeveelheid vastgesteld door calculatie — niet aanpasbaar"
            >
              {regel.hoeveelheid.toFixed(2)}
            </span>
          </div>

          {/* Eenheid (LOCKED) */}
          <div className="flex-shrink-0 w-10 px-1 text-left">
            <span className="text-xs text-teal-600 font-mono">{regel.eenheid}</span>
          </div>

          {/* WB kostprijs */}
          <div className="flex-shrink-0 w-24 px-2 text-right">
            <span className="text-xs font-mono text-slate-700 font-semibold">{formatEuro(wbKP)}</span>
          </div>

          {/* Verschil vs origineel */}
          <div className="flex-shrink-0 w-20 px-2 text-right">
            {vergelijking && vergelijking.gewijzigd ? (
              <span className={`text-xs font-mono font-semibold ${vergelijking.kp_verschil < 0 ? 'text-green-600' : 'text-red-500'}`}>
                {vergelijking.kp_verschil < 0 ? '▼' : '▲'} {Math.abs(vergelijking.kp_verschil_pct).toFixed(1)}%
              </span>
            ) : (
              <span className="text-xs text-slate-200">—</span>
            )}
          </div>

          {/* Wijzigingen indicator + knop */}
          <button
            className={`flex-shrink-0 w-7 h-8 flex items-center justify-center transition-colors ${
              vergelijking?.gewijzigd
                ? 'text-amber-400 hover:text-amber-600'
                : 'text-slate-200 hover:text-slate-400'
            }`}
            onClick={() => setSidebarRegelId(regel.id)}
            title="Wijzigingshistorie"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Componentregels */}
        {isUitgebreid && (
          <div className="bg-slate-50/50 pb-1">
            {regelComps.map(comp => (
              <WerkbegrotingComponentRij
                key={comp.id}
                comp={comp}
                geselecteerd={geselecteerd.has(comp.id)}
                onToggleSelecteer={() => toggleSelecteer(comp.id)}
                onWijzig={(patch) => onComponentWijzig(comp.id, patch)}
                onVerwijder={() => verwijderComp(comp.id)}
              />
            ))}
            {/* Voeg component toe */}
            <div className="flex gap-2 px-8 py-1">
              {(['arbeid', 'materieel', 'onderaanneming'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => voegComponentToe(regel.id, type)}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-everts px-2 py-0.5 rounded border border-dashed border-slate-200 hover:border-everts/40 transition-colors"
                >
                  <Plus className="w-2.5 h-2.5" />
                  {type === 'arbeid' ? 'Arbeid' : type === 'materieel' ? 'Materieel' : 'Onderaanneming'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const geselecteerdeComponenten = componenten.filter(c => geselecteerd.has(c.id))

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Tabelheader */}
      <div className="flex items-center gap-0 bg-white border-b-2 border-slate-200 sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <div className="w-7 flex-shrink-0" />
        <div className="flex-1 min-w-0 px-2 py-2">Omschrijving</div>
        <div className="flex-shrink-0 w-16 px-2 text-right">Aant.</div>
        <div className="flex-shrink-0 w-10 px-1">Eenh.</div>
        <div className="flex-shrink-0 w-24 px-2 text-right text-everts">Tot. KP</div>
        <div className="flex-shrink-0 w-20 px-2 text-right">Δ Bespar.</div>
        <div className="flex-shrink-0 w-7" />
      </div>

      {/* Inhoud */}
      <div className="flex-1 overflow-y-auto">
        {toplevelGroepen.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Geen calculatieregels gevonden.
          </div>
        ) : (
          toplevelGroepen.map(g => renderGroep(g, 0))
        )}
      </div>

      {/* Bulk edit panel (als selectie actief) */}
      {geselecteerd.size > 0 && (
        <BulkBewerkPanel
          geselecteerdeComponenten={geselecteerdeComponenten}
          werkbegrotingId={werkbegrotingId}
          onWijzig={(patch) => {
            geselecteerdeComponenten.forEach(c => onComponentWijzig(c.id, patch))
          }}
          onBestelling={() => setBestellingOpen(true)}
          onWisSelectie={() => setGeselecteerd(new Set())}
        />
      )}

      {/* Wijzigingen sidebar */}
      {sidebarRegelId && (
        <WijzigingenSidebar
          regelId={sidebarRegelId}
          onSluit={() => setSidebarRegelId(null)}
        />
      )}

      {/* Bestelling modal */}
      {bestellingOpen && (
        <BestellingModal
          werkbegrotingId={werkbegrotingId}
          componenten={geselecteerdeComponenten}
          onSluit={() => setBestellingOpen(false)}
          onAangemaakt={() => {
            setBestellingOpen(false)
            setGeselecteerd(new Set())
            onWijziging()
          }}
        />
      )}
    </div>
  )
}

// ─── Component rij ────────────────────────────────────────────────────────────

interface CompRijProps {
  comp: WerkbegrotingComponent
  geselecteerd: boolean
  onToggleSelecteer: () => void
  onWijzig: (patch: Partial<WerkbegrotingComponent>) => void
  onVerwijder: () => void
}

function WerkbegrotingComponentRij({ comp, geselecteerd, onToggleSelecteer, onWijzig, onVerwijder }: CompRijProps) {
  const typeKleur = comp.type === 'arbeid' ? 'text-blue-600 bg-blue-50' : comp.type === 'materieel' ? 'text-red-600 bg-red-50' : 'text-purple-600 bg-purple-50'
  const ni = (val: number, onChange: (v: number) => void, step = '0.01') => (
    <input
      type="number" step={step} min="0" value={val === 0 ? '' : val}
      className="w-full text-xs text-right font-mono px-1 py-0.5 rounded border-0 bg-transparent hover:bg-white hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-slate-300 focus:outline-none"
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
    />
  )

  return (
    <div className={`flex items-center gap-0 group border-b border-slate-100/60 hover:bg-white/60 transition-colors ${geselecteerd ? 'bg-everts-50/40' : ''}`} style={{ minHeight: '28px' }}>
      {/* Selecteer checkbox */}
      <div className="flex-shrink-0 w-7 flex items-center justify-center">
        <input
          type="checkbox"
          checked={geselecteerd}
          onChange={onToggleSelecteer}
          className="w-3 h-3 rounded accent-everts cursor-pointer"
        />
      </div>

      {/* Type badge */}
      <div className="flex-shrink-0 px-2">
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${typeKleur}`}>
          {comp.type === 'arbeid' ? 'AB' : comp.type === 'materieel' ? 'MT' : 'OA'}
        </span>
      </div>

      {/* Omschrijving */}
      <div className="w-32 flex-shrink-0 px-1">
        <input
          className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent hover:bg-white hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-slate-300 focus:outline-none text-slate-600 placeholder:text-slate-300"
          value={comp.omschrijving ?? ''}
          placeholder="Omschrijving..."
          onChange={e => onWijzig({ omschrijving: e.target.value || undefined })}
        />
      </div>

      {/* Norm */}
      <div className="w-16 flex-shrink-0 px-1">
        {ni(comp.norm_hoeveelheid, v => onWijzig({ norm_hoeveelheid: v }))}
      </div>

      {/* Eenheid */}
      <div className="w-12 flex-shrink-0 px-1">
        <select
          value={comp.eenheid ?? 'st'}
          className="w-full text-xs px-0.5 py-0.5 rounded border-0 bg-transparent hover:bg-white focus:bg-white focus:border focus:border-slate-300 focus:outline-none text-slate-500"
          onChange={e => onWijzig({ eenheid: e.target.value as Eenheid })}
        >
          {EENHEDEN.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Tarief */}
      <div className="w-20 flex-shrink-0 px-1">
        {ni(comp.tarief, v => onWijzig({ tarief: v }))}
      </div>

      {/* Leverancier / onderaannemer */}
      <div className="flex-1 min-w-0 px-1">
        <RelatieZoekveld
          type={comp.type === 'onderaanneming' ? 'onderaannemer' : 'leverancier'}
          relatieId={comp.relatie_id}
          relatieNaam={comp.leverancier_naam ?? comp.aannemersnaam}
          onSelecteer={(id, naam) => {
            if (comp.type === 'onderaanneming') {
              onWijzig({ relatie_id: id, aannemersnaam: naam, leverancier_naam: undefined })
            } else {
              onWijzig({ relatie_id: id, leverancier_naam: naam, aannemersnaam: undefined })
            }
          }}
          onWis={() => onWijzig({ relatie_id: undefined, leverancier_naam: undefined, aannemersnaam: undefined })}
        />
      </div>

      {/* Verwijder */}
      <button
        onClick={onVerwijder}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        title="Component verwijderen"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
