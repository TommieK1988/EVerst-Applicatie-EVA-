'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, BookOpen, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getActiviteiten, getLijnen, slaActiviteitOp, slaLijnOp,
  verwijderActiviteit, verwijderLijn,
  getElementen, slaElementOp, verwijderElement,
  getLocaties,
} from '@/lib/everts-calc/local-store'
import { berekenLijnTotaal, formatEuro, formatGetal } from '@/lib/everts-calc/calculations'
import { nieuweId } from '@/lib/everts-calc/utils'
import ActiviteitToevoegenModal from './ActiviteitToevoegenModal'
import type { Selectie, Scenario, Activiteit, CalculatieLijn, Element, Eenheid } from '@/lib/everts-calc/types'
import { EENHEDEN, LIJN_TYPES } from '@/lib/everts-calc/types'

interface Props {
  selectie: Selectie
  scenario: Scenario
  onWijziging: () => void
}

// ─── Type styling ─────────────────────────────────────────────────────────────

const TYPE_KLEUR: Record<string, string> = {
  arbeid:       'bg-blue-50 text-blue-700',
  materiaal:    'bg-red-50 text-red-700',
  materieel:    'bg-red-50 text-red-700',
  onderaannemer:'bg-purple-50 text-purple-700',
  gemengd:      'bg-slate-100 text-slate-600',
}

const TYPE_AFKORTING: Record<string, string> = {
  arbeid:       'AB',
  materiaal:    'MA',
  materieel:    'MT',
  onderaannemer:'OA',
  gemengd:      '—',
}

function dominantType(lijnen: CalculatieLijn[]): string {
  if (lijnen.length === 0) return 'gemengd'
  const types = new Set(lijnen.map(l => l.lijn_type))
  if (types.size === 1) return lijnen[0].lijn_type
  return 'gemengd'
}

// ─── Bereken activiteit kolommen ──────────────────────────────────────────────

interface RijTotalen {
  min_pe: number; tot_min: number; tot_uren: number
  mat_pe: number; tot_mat: number
  oa_pe: number;  tot_oa: number
  kp_pe: number;  tot_kp: number
  vp_pe: number;  tot_vp: number
}

function berekenRijTotalen(act: Activiteit, lijnen: CalculatieLijn[], opslag: number): RijTotalen {
  const arbeid    = lijnen.filter(l => l.lijn_type === 'arbeid')
  const materiaal = lijnen.filter(l => l.lijn_type === 'materiaal')
  const oa        = lijnen.filter(l => l.lijn_type === 'onderaannemer')

  const uren_pe = arbeid.reduce((s, l) => s + l.hoeveelheid, 0)
  const min_pe  = uren_pe * 60
  const tot_min = min_pe  * act.hoeveelheid
  const tot_uren= uren_pe * act.hoeveelheid

  const mat_pe  = materiaal.reduce((s, l) => s + l.hoeveelheid * l.eenheidsprijs * l.verliesfactor, 0)
  const tot_mat = mat_pe * act.hoeveelheid

  const oa_pe   = oa.reduce((s, l) => s + l.hoeveelheid * l.eenheidsprijs, 0)
  const tot_oa  = oa_pe * act.hoeveelheid

  const kp_pe   = lijnen.reduce((s, l) => s + berekenLijnTotaal(l), 0)
  const tot_kp  = kp_pe * act.hoeveelheid

  const vp_pe   = kp_pe * (1 + opslag / 100)
  const tot_vp  = vp_pe * act.hoeveelheid

  return { min_pe, tot_min, tot_uren, mat_pe, tot_mat, oa_pe, tot_oa, kp_pe, tot_kp, vp_pe, tot_vp }
}

// ─── Lijn sub-rij ─────────────────────────────────────────────────────────────

interface LijnSubRijProps {
  lijn: CalculatieLijn
  activiteit: Activiteit
  onWijzig: (lijn: CalculatieLijn) => void
  onVerwijder: () => void
}

function LijnSubRij({ lijn, activiteit, onWijzig, onVerwijder }: LijnSubRijProps) {
  const isArbeid    = lijn.lijn_type === 'arbeid'
  const isMateriaal = lijn.lijn_type === 'materiaal'
  const isOA        = lijn.lijn_type === 'onderaannemer'

  const min_pe  = isArbeid    ? lijn.hoeveelheid * 60 : null
  const tot_min = min_pe !== null ? min_pe * activiteit.hoeveelheid : null
  const tot_uren= isArbeid    ? lijn.hoeveelheid * activiteit.hoeveelheid : null
  const mat_pe  = isMateriaal ? lijn.hoeveelheid * lijn.eenheidsprijs * lijn.verliesfactor : null
  const tot_mat = mat_pe !== null ? mat_pe * activiteit.hoeveelheid : null
  const oa_pe   = isOA        ? lijn.hoeveelheid * lijn.eenheidsprijs : null
  const tot_oa  = oa_pe !== null ? oa_pe * activiteit.hoeveelheid : null
  const kp_pe   = berekenLijnTotaal(lijn)
  const tot_kp  = kp_pe * activiteit.hoeveelheid

  const n = (v: number | null, d = 2) =>
    v !== null && v !== 0 ? formatGetal(v, d) : ''

  return (
    <tr className="group bg-slate-50/40 border-b border-slate-100">
      <td className="px-2 py-1 pl-10 whitespace-nowrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_KLEUR[lijn.lijn_type]}`}>
          {TYPE_AFKORTING[lijn.lijn_type]}
        </span>
      </td>
      <td className="px-2 py-1 min-w-[140px]">
        <input
          className="w-full text-xs px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent text-slate-600"
          value={lijn.omschrijving}
          onChange={e => onWijzig({ ...lijn, omschrijving: e.target.value })}
        />
      </td>
      <td className="px-2 py-1 text-right">
        <input
          type="number" step="0.001" min="0"
          className="w-20 text-xs text-right px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent  text-slate-600"
          value={lijn.hoeveelheid}
          onChange={e => onWijzig({ ...lijn, hoeveelheid: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className="px-2 py-1">
        <select
          className="text-xs px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent text-slate-600"
          value={lijn.eenheid}
          onChange={e => onWijzig({ ...lijn, eenheid: e.target.value as Eenheid })}
        >
          {EENHEDEN.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">{n(min_pe, 1)}</td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">{n(tot_min, 1)}</td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">{n(tot_uren, 2)}</td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">
        {mat_pe !== null ? formatEuro(mat_pe) : ''}
      </td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">
        {tot_mat !== null ? formatEuro(tot_mat) : ''}
      </td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">
        {oa_pe !== null ? formatEuro(oa_pe) : ''}
      </td>
      <td className="px-2 py-1 text-right  text-xs text-slate-500">
        {tot_oa !== null ? formatEuro(tot_oa) : ''}
      </td>
      <td className="px-2 py-1 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <input
            type="number" step="0.01" min="0"
            className="w-20 text-xs text-right px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent  text-slate-600"
            value={lijn.eenheidsprijs}
            onChange={e => onWijzig({ ...lijn, eenheidsprijs: parseFloat(e.target.value) || 0 })}
            title="Eenheidsprijs"
          />
          <span className="text-slate-400 text-xs">€</span>
        </div>
      </td>
      <td className="px-2 py-1 text-right  text-xs text-slate-600">
        {tot_kp > 0 ? formatEuro(tot_kp) : ''}
      </td>
      {/* Opslag % — leeg */}
      <td />
      {/* BTW % */}
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <input
          type="number" step="1" min="0" max="100"
          className="w-12 text-xs text-right px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent  text-slate-600"
          value={lijn.btw_pct ?? 21}
          onChange={e => onWijzig({ ...lijn, btw_pct: parseFloat(e.target.value) || 0 })}
        />
        <span className="text-xs text-slate-400">%</span>
      </td>
      <td /><td />
      <td className="px-2 py-1">
        <button
          onClick={onVerwijder}
          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

// ─── Activiteit rij ───────────────────────────────────────────────────────────

interface ActiviteitRijProps {
  activiteit: Activiteit
  scenario: Scenario
  onVerwijder: () => void
  onWijziging: () => void
}

function ActiviteitRij({ activiteit, scenario, onVerwijder, onWijziging }: ActiviteitRijProps) {
  const [lijnen, setLijnen]         = useState<CalculatieLijn[]>([])
  const [uitgeklapt, setUitgeklapt] = useState(false)

  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico
  const opslag = activiteit.opslag_pct ?? defaultOpslag

  const laadLijnen = useCallback(() => { setLijnen(getLijnen(activiteit.id)) }, [activiteit.id])
  useEffect(() => { laadLijnen() }, [laadLijnen])

  const r = berekenRijTotalen(activiteit, lijnen, opslag)
  const type = dominantType(lijnen)

  const wijzigActiviteit = (veld: Partial<Activiteit>) => {
    slaActiviteitOp({ ...activiteit, ...veld })
    onWijziging()
  }

  const wijzigLijn = (lijn: CalculatieLijn) => {
    slaLijnOp(lijn)
    laadLijnen()
    onWijziging()
  }

  const verwijderLijnItem = (id: string) => {
    verwijderLijn(id)
    laadLijnen()
    onWijziging()
  }

  const voegLijnToe = (lijnType: keyof typeof LIJN_TYPES) => {
    const nieuweLijn: CalculatieLijn = {
      id: nieuweId(),
      activiteit_id: activiteit.id,
      lijn_type: lijnType,
      omschrijving: lijnType === 'arbeid' ? 'Schilder' : lijnType === 'materiaal' ? 'Materiaal' : lijnType === 'onderaannemer' ? 'Onderaannemer' : 'Materieel',
      hoeveelheid: lijnType === 'arbeid' ? 0.10 : 1,
      eenheid: lijnType === 'arbeid' ? 'uur' : lijnType === 'onderaannemer' ? 'st' : 'm²',
      eenheidsprijs: lijnType === 'arbeid' ? 58 : 0,
      verliesfactor: 1.0,
    }
    slaLijnOp(nieuweLijn)
    laadLijnen()
    onWijziging()
  }

  const dash = (v: number, fmt: (n: number) => string) =>
    v !== 0 ? fmt(v) : <span className="text-slate-300">—</span>

  return (
    <>
      <tr className="group border-t border-slate-200 hover:bg-everts-50/30 transition-colors">
        <td className="px-2 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setUitgeklapt(u => !u)}
              className="p-0.5 text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              {uitgeklapt
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${TYPE_KLEUR[type]}`}>
              {TYPE_AFKORTING[type]}
            </span>
          </div>
        </td>
        <td className="px-2 py-2 min-w-[160px]">
          <input
            className="w-full text-sm font-semibold px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent"
            value={activiteit.naam}
            onChange={e => wijzigActiviteit({ naam: e.target.value })}
          />
        </td>
        <td className="px-2 py-2 text-right">
          <input
            type="number" step="0.01" min="0"
            className="w-20 text-sm text-right font-semibold px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent "
            value={activiteit.hoeveelheid}
            onChange={e => wijzigActiviteit({ hoeveelheid: parseFloat(e.target.value) || 0 })}
          />
        </td>
        <td className="px-2 py-2">
          <select
            className="text-sm font-semibold px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent"
            value={activiteit.eenheid}
            onChange={e => wijzigActiviteit({ eenheid: e.target.value as Eenheid })}
          >
            {EENHEDEN.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.min_pe, v => formatGetal(v, 2))}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.tot_min, v => formatGetal(v, 2))}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.tot_uren, v => formatGetal(v, 2))}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.mat_pe, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.tot_mat, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.oa_pe, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.tot_oa, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-xs font-semibold text-slate-700">
          {dash(r.kp_pe, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-sm font-bold text-everts-dark">
          {dash(r.tot_kp, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <input
            type="number" step="0.5" min="0"
            className="w-14 text-sm text-right px-1 py-0.5 rounded border-0 hover:border hover:border-slate-200 focus:border focus:border-everts focus:outline-none bg-transparent "
            value={opslag}
            onChange={e => wijzigActiviteit({ opslag_pct: parseFloat(e.target.value) || 0 })}
          />
          <span className="text-xs text-slate-400 ml-0.5">%</span>
        </td>
        {/* BTW — leeg op activiteit niveau */}
        <td />
        <td className="px-2 py-2 text-right  text-xs text-slate-600">
          {dash(r.vp_pe, formatEuro)}
        </td>
        <td className="px-2 py-2 text-right  text-sm font-bold text-everts">
          {dash(r.tot_vp, formatEuro)}
        </td>
        <td className="px-2 py-2">
          <button
            onClick={onVerwijder}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>

      {uitgeklapt && (
        <>
          {lijnen.map(lijn => (
            <LijnSubRij
              key={lijn.id}
              lijn={lijn}
              activiteit={activiteit}
              onWijzig={wijzigLijn}
              onVerwijder={() => verwijderLijnItem(lijn.id)}
            />
          ))}
          <tr>
            <td colSpan={18} className="py-1.5 pl-12 bg-slate-50/60 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {(['arbeid', 'materiaal', 'materieel', 'onderaannemer'] as const).map(t => (
                  <Button
                    key={t}
                    variant="ghost"
                    size="sm"
                    onClick={() => voegLijnToe(t)}
                  >
                    <Plus className="w-3 h-3" />
                    {LIJN_TYPES[t]}
                  </Button>
                ))}
              </div>
            </td>
          </tr>
        </>
      )}
    </>
  )
}

// ─── Begrotingsregel sectie ───────────────────────────────────────────────────

interface BegrotingsregelSectieProps {
  element: Element
  scenario: Scenario
  onVerwijder: () => void
  onWijziging: () => void
}

function BegrotingsregelSectie({ element, scenario, onVerwijder, onWijziging }: BegrotingsregelSectieProps) {
  const [activiteiten, setActiviteiten] = useState<Activiteit[]>([])
  const [modalOpen, setModalOpen]       = useState(false)

  const laadActiviteiten = useCallback(() => {
    const acts = getActiviteiten(element.id, scenario.id).sort((a, b) => a.volgorde - b.volgorde)
    setActiviteiten(acts)
  }, [element.id, scenario.id])

  useEffect(() => { laadActiviteiten() }, [laadActiviteiten])

  const handleWijziging = () => { laadActiviteiten(); onWijziging() }

  const voegActiviteitToe = () => {
    const act: Activiteit = {
      id: nieuweId(),
      element_id: element.id,
      scenario_id: scenario.id,
      naam: 'Nieuwe activiteit',
      eenheid: 'm²',
      hoeveelheid: 1,
      volgorde: activiteiten.length + 1,
    }
    slaActiviteitOp(act)
    laadActiviteiten()
    onWijziging()
  }

  const sectionKP = activiteiten.reduce((som, act) => {
    const lijnen = getLijnen(act.id)
    return som + lijnen.reduce((s, l) => s + berekenLijnTotaal(l), 0) * act.hoeveelheid
  }, 0)

  const sectionVP = activiteiten.reduce((som, act) => {
    const lijnen = getLijnen(act.id)
    const kp = lijnen.reduce((s, l) => s + berekenLijnTotaal(l), 0)
    const opslag = act.opslag_pct ?? (scenario.opslag_algemene_kosten + scenario.opslag_winst_risico)
    return som + kp * (1 + opslag / 100) * act.hoeveelheid
  }, 0)

  return (
    <>
      {/* Begrotingsregel header */}
      <tr className="bg-slate-100/80 border-t-2 border-slate-300">
        <td colSpan={18} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-everts flex-shrink-0" />
            <span className="font-semibold text-sm text-everts-dark">{element.naam}</span>
            <span className="text-xs text-slate-400">
              {activiteiten.length} activiteit{activiteiten.length !== 1 ? 'en' : ''}
            </span>
            <div className="flex-1" />
            {sectionKP > 0 && (
              <span className="text-xs text-slate-500 ">
                KP: {formatEuro(sectionKP)} · VP: {formatEuro(sectionVP)}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              <BookOpen className="w-3 h-3" />
              Bibliotheek
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={voegActiviteitToe}
            >
              <Plus className="w-3 h-3" />
              Activiteit
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onVerwijder}
              title="Begrotingsregel verwijderen"
              className="text-slate-300 hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Activiteiten */}
      {activiteiten.map(act => (
        <ActiviteitRij
          key={act.id}
          activiteit={act}
          scenario={scenario}
          onVerwijder={() => {
            verwijderActiviteit(act.id)
            laadActiviteiten()
            onWijziging()
            toast.success('Activiteit verwijderd')
          }}
          onWijziging={handleWijziging}
        />
      ))}

      {activiteiten.length === 0 && (
        <tr>
          <td colSpan={18} className="px-4 py-3 text-center text-xs text-slate-400 italic">
            Nog geen activiteiten — voeg er een toe via Bibliotheek of Activiteit
          </td>
        </tr>
      )}

      <ActiviteitToevoegenModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        elementId={element.id}
        scenarioId={scenario.id}
        onToegevoegd={() => {
          laadActiviteiten()
          onWijziging()
          setModalOpen(false)
          toast.success('Activiteit toegevoegd')
        }}
      />
    </>
  )
}

// ─── Tabel header ─────────────────────────────────────────────────────────────

function TabelHeader() {
  return (
    <thead>
      <tr className="bg-slate-50 border-b border-slate-200">
        <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap w-32">Type</th>
        <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide min-w-[160px]">Omschrijving</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap w-24">Hoeveelheid</th>
        <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide w-16">Eenh.</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-blue-500 uppercase tracking-wide whitespace-nowrap w-20">Min/e</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-blue-500 uppercase tracking-wide whitespace-nowrap w-20">Tot. min</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-blue-500 uppercase tracking-wide whitespace-nowrap w-20">Uren</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-amber-600 uppercase tracking-wide whitespace-nowrap w-24">Mat/e</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-amber-600 uppercase tracking-wide whitespace-nowrap w-24">Tot. mat</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-orange-500 uppercase tracking-wide whitespace-nowrap w-24">OA/e</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-orange-500 uppercase tracking-wide whitespace-nowrap w-24">Tot. OA</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-slate-600 uppercase tracking-wide whitespace-nowrap w-24">KP/e</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-slate-700 uppercase tracking-wide whitespace-nowrap w-28 bg-slate-100">Tot. KP</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-everts uppercase tracking-wide whitespace-nowrap w-24">Opslag %</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap w-20">BTW %</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-everts uppercase tracking-wide whitespace-nowrap w-24">VP/e</th>
        <th className="px-2 py-2 text-right text-xs font-medium text-everts uppercase tracking-wide whitespace-nowrap w-28 bg-everts-50">Tot. VP</th>
        <th className="w-8" />
      </tr>
    </thead>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function CalculatieDetail({ selectie, scenario, onWijziging }: Props) {
  const [elementen, setElementen] = useState<Element[]>([])
  const [titelNaam, setTitelNaam] = useState('')

  const laadElementen = useCallback(() => {
    if (selectie.type === 'locatie') {
      const elms = getElementen(selectie.id).sort((a, b) => a.volgorde - b.volgorde)
      setElementen(elms)
      const loc = getLocaties().find(l => l.id === selectie.id)
      setTitelNaam(loc?.naam ?? 'Locatie')
    }
  }, [selectie])

  useEffect(() => { laadElementen() }, [laadElementen])

  const voegBegrotingsregelToe = () => {
    if (selectie.type !== 'locatie') return
    const elm: Element = {
      id: nieuweId(),
      locatie_id: selectie.id,
      naam: 'Nieuwe begrotingsregel',
      element_type: 'overig',
      volgorde: elementen.length + 1,
    }
    slaElementOp(elm)
    laadElementen()
  }

  const handleVerwijderElement = (id: string) => {
    verwijderElement(id)
    laadElementen()
    onWijziging()
    toast.success('Begrotingsregel verwijderd')
  }

  const totaalKP = elementen.reduce((som, elm) => {
    const acts = getActiviteiten(elm.id, scenario.id)
    return som + acts.reduce((s, act) => {
      const lijnen = getLijnen(act.id)
      return s + lijnen.reduce((ls, l) => ls + berekenLijnTotaal(l), 0) * act.hoeveelheid
    }, 0)
  }, 0)

  const totaalVP = elementen.reduce((som, elm) => {
    const acts = getActiviteiten(elm.id, scenario.id)
    return som + acts.reduce((s, act) => {
      const lijnen = getLijnen(act.id)
      const kp = lijnen.reduce((ls, l) => ls + berekenLijnTotaal(l), 0)
      const opslag = act.opslag_pct ?? (scenario.opslag_algemene_kosten + scenario.opslag_winst_risico)
      return s + kp * (1 + opslag / 100) * act.hoeveelheid
    }, 0)
  }, 0)

  if (selectie.type !== 'locatie') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
        <p className="text-sm">Selecteer een locatie in de projectboom om de begrotingsregels te bewerken.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h2 className="font-semibold text-slate-800">{titelNaam}</h2>
          <p className="text-xs text-slate-400">
            {elementen.length} begrotingsregel{elementen.length !== 1 ? 's' : ''}
            {totaalKP > 0 && (
              <>
                {' · '}Kostprijs: <span className="font-medium text-slate-600">{formatEuro(totaalKP)}</span>
                {' · '}Verkoopprijs: <span className="font-medium text-everts">{formatEuro(totaalVP)}</span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={voegBegrotingsregelToe}
        >
          <Plus className="w-3.5 h-3.5" />
          Begrotingsregel
        </Button>
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        {elementen.length > 0 ? (
          <table className="w-full text-sm border-collapse min-w-[1400px]">
            <TabelHeader />
            <tbody>
              {elementen.map(elm => (
                <BegrotingsregelSectie
                  key={elm.id}
                  element={elm}
                  scenario={scenario}
                  onVerwijder={() => handleVerwijderElement(elm.id)}
                  onWijziging={() => { laadElementen(); onWijziging() }}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={12} className="px-3 py-2.5 text-sm font-semibold text-slate-700">
                  Totaal locatie
                </td>
                <td className="px-2 py-2.5 text-right font-bold  text-everts-dark">
                  {formatEuro(totaalKP)}
                </td>
                <td /><td /><td />
                <td className="px-2 py-2.5 text-right font-bold  text-everts">
                  {formatEuro(totaalVP)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="Nog geen begrotingsregels"
              description="Voeg een begrotingsregel toe om te beginnen met calculeren."
              actions={
                <Button variant="primary" size="md" onClick={voegBegrotingsregelToe}>
                  <Plus className="w-4 h-4" />
                  Begrotingsregel toevoegen
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
