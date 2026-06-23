'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import {
  Save, RefreshCw, Plus, X, FileText, ChevronRight, Calculator, Package,
} from 'lucide-react'
import { getInstellingen, slaInstellingenOp } from '@/lib/everts-calc/local-store'
import DicoIntegratiesBeheer from './DicoIntegratiesBeheer'

// ─── Constanten ───────────────────────────────────────────────────────────────

const KOLOM_STANDAARD: { id: string; label: string }[] = [
  { id: 'omschrijving', label: 'Omschrijving' },
  { id: 'aant',         label: 'Aant.' },
  { id: 'eenh',         label: 'Eenh.' },
  { id: 'stelpost',     label: 'STP' },
  { id: 'uur_eenh',     label: 'Uur/e.' },
  { id: 'min_eenh',     label: 'Min/e.' },
  { id: 'tarief_ab',    label: 'Tarief AB' },
  { id: 'bedrag_ab',    label: 'Bedrag AB' },
  { id: 'prijs_mt',     label: 'Prijs MA' },
  { id: 'bedrag_mt',    label: 'Bedrag MA' },
  { id: 'prijs_oa',     label: 'Prijs OA' },
  { id: 'bedrag_oa',    label: 'Bedrag OA' },
  { id: 'kp_eenh',      label: 'KP/e.' },
  { id: 'tot_kp',       label: 'Tot. KP' },
  { id: 'opslag_pct',   label: 'Opsl.%' },
  { id: 'vp_eenh',      label: 'VP/e.' },
  { id: 'tot_vp',       label: 'Tot. VP' },
  { id: 'btw_pct',      label: 'BTW %' },
]

// ─── Hoofd component ──────────────────────────────────────────────────────────

type TabKey = 'calculatie' | 'offerte' | 'materialen'

export default function Instellingen() {
  const [activeTab, setActiveTab] = useState<TabKey>('calculatie')

  const resetData = () => {
    if (typeof window === 'undefined') return
    const keys = Object.keys(localStorage).filter(k => k.startsWith('evc_'))
    keys.forEach(k => localStorage.removeItem(k))
    toast.success('Data gereset naar demo-stand')
    setTimeout(() => window.location.reload(), 500)
  }

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'calculatie', label: 'Calculatie',          icon: Calculator },
    { key: 'offerte',    label: 'Offerte instellingen', icon: FileText },
    { key: 'materialen', label: 'Materialen / DICO',     icon: Package },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Instellingen"
        description="Calculatie-instellingen, eenheden, categorieën en kolomnamen"
      />

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'border-everts text-everts'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'calculatie' && <CalculatieTab />}
      {activeTab === 'offerte'    && <OfferteTab />}
      {activeTab === 'materialen' && <DicoIntegratiesBeheer />}

      {/* Reset */}
      <div className="flex justify-start pt-2 border-t border-slate-100">
        <button
          onClick={resetData}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-red-500 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Demo data herladen
        </button>
      </div>

      {/* Over */}
      <div className="bg-everts-dark rounded-xl p-5 text-center">
        <img src="/logo-wit.svg" alt="Everts Groep" className="h-8 mx-auto mb-3" />
        <div className="text-white/60 text-xs">
          EvertsCalc v1.0 · Calculatiesoftware voor vastgoedonderhoud
        </div>
        <div className="text-white/40 text-xs mt-1">
          © 2024 Everts Groep
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Calculatie ──────────────────────────────────────────────────────────

function CalculatieTab() {
  const inst = getInstellingen()

  const [opslagen, setOpslagen] = useState({ ak: 8, wr: 10, overhead: 0 })
  const [eenheden, setEenheden] = useState<string[]>(
    () => inst.eenheden ?? ['m²', 'm¹', 'st', 'uur', 'dag', 'm³', 'ltr', 'kg', 'set']
  )
  const [categorieen, setCategorieen] = useState<string[]>(
    () => inst.categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
  )
  const [kolomNamen, setKolomNamen] = useState<Record<string, string>>(
    () => (inst.kolom_namen ?? {}) as Record<string, string>
  )
  const [nieuwEenheid,      setNieuwEenheid]      = useState('')
  const [nieuwCategorie,    setNieuwCategorie]    = useState('')
  const [kostengroepen,     setKostengroepen]     = useState<string[]>(
    () => inst.standaard_kostengroepen ?? ['Bouwplaats', 'Bereikbaarheid', 'Arbeid', 'Materieel', 'Onderaanneming']
  )
  const [nieuwKostengroep,  setNieuwKostengroep]  = useState('')

  const opslaan = () => {
    const schoonKolomNamen = Object.fromEntries(
      Object.entries(kolomNamen).filter(([, v]) => v.trim() !== '')
    )
    slaInstellingenOp({
      ...inst,
      kolom_namen: schoonKolomNamen,
      eenheden,
      categorieen,
      standaard_kostengroepen: kostengroepen,
    })
    toast.success('Calculatie-instellingen opgeslagen')
  }

  return (
    <div className="space-y-6">

      {/* Uurtarieven — verwijzing naar EVA */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">Uurtarieven</p>
        <p>
          Uurtarieven worden centraal beheerd via{' '}
          <Link href="/instellingen/planning" className="underline hover:text-blue-900">
            Bedrijfsinstellingen → Planning
          </Link>
          . Ze worden automatisch gesynchroniseerd met EvertsCalc.
        </p>
      </div>

      {/* Standaard opslagen */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Standaard opslagen (nieuwe projecten)</h3>
        <p className="text-xs text-slate-400 mb-4">
          Deze opslagen worden gebruikt als standaard bij het aanmaken van een nieuw project.
        </p>
        <div className="space-y-3">
          {([
            { key: 'ak'       as const, label: 'Algemene kosten (AK)', help: 'Kantoorkosten, overhead, etc.' },
            { key: 'wr'       as const, label: 'Winst & Risico (W&R)', help: 'Winstmarge + risicobuffer' },
            { key: 'overhead' as const, label: 'Extra overhead',        help: 'Optioneel extra opslag' },
          ]).map(({ key, label, help }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm text-slate-700 font-medium">{label}</div>
                <div className="text-xs text-slate-400">{help}</div>
              </div>
              <div className="relative w-28">
                <input
                  type="number" step="0.1" min="0" max="100"
                  value={opslagen[key]}
                  onChange={e => setOpslagen(o => ({ ...o, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full pr-8 pl-3 py-2 border border-slate-200 rounded-lg text-sm  text-right focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-2 font-medium">Preview verkoopprijs bij € 10.000 kostprijs:</div>
          {(() => {
            const kp = 10000
            const na_ak = kp * (1 + opslagen.ak / 100)
            const na_wr = na_ak * (1 + opslagen.wr / 100)
            const vkp = na_wr * (1 + opslagen.overhead / 100)
            const marge = ((vkp - kp) / vkp) * 100
            return (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Kostprijs: <strong>€ 10.000</strong></span>
                <span className="text-slate-400">→</span>
                <span className="text-everts font-bold">Verkoop: € {vkp.toFixed(0)}</span>
                <span className="text-slate-500">Marge: {marge.toFixed(1)}%</span>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Eenheden */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Eenheden</h3>
        <p className="text-xs text-slate-400 mb-4">
          Beschikbare eenheden voor recepten en het calculatiegrid.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {eenheden.map(e => (
            <div key={e} className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2.5 py-1">
              <span className="text-sm  text-slate-700">{e}</span>
              <button onClick={() => setEenheden(prev => prev.filter(x => x !== e))} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text" value={nieuwEenheid}
            onChange={e => setNieuwEenheid(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && nieuwEenheid.trim() && !eenheden.includes(nieuwEenheid.trim())) {
                setEenheden(prev => [...prev, nieuwEenheid.trim()]); setNieuwEenheid('')
              }
            }}
            placeholder="bijv. raam"
            className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm  focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
          <button
            onClick={() => {
              if (nieuwEenheid.trim() && !eenheden.includes(nieuwEenheid.trim())) {
                setEenheden(prev => [...prev, nieuwEenheid.trim()]); setNieuwEenheid('')
              }
            }}
            className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Toevoegen
          </button>
        </div>
      </div>

      {/* Kostengroepen */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Kostengroepen</h3>
        <p className="text-xs text-slate-400 mb-4">
          Standaard kostengroepen beschikbaar in de calculatie. Je kunt ze ook direct per regel instellen.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {kostengroepen.map((kg, i) => (
            <div key={kg} className="inline-flex items-center gap-1.5 bg-everts/8 border border-everts/20 rounded-lg px-2.5 py-1">
              <span className="text-sm text-everts-dark font-medium">{kg}</span>
              <button
                onClick={() => setKostengroepen(prev => prev.filter((_, j) => j !== i))}
                className="text-everts/40 hover:text-red-500 transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {kostengroepen.length === 0 && (
            <span className="text-xs text-slate-400 italic">Nog geen kostengroepen aangemaakt</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nieuwKostengroep}
            onChange={e => setNieuwKostengroep(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = nieuwKostengroep.trim()
                if (v && !kostengroepen.includes(v)) { setKostengroepen(prev => [...prev, v]); setNieuwKostengroep('') }
              }
            }}
            placeholder="bijv. Steigerwerk"
            className="w-44 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
          <button
            onClick={() => {
              const v = nieuwKostengroep.trim()
              if (v && !kostengroepen.includes(v)) { setKostengroepen(prev => [...prev, v]); setNieuwKostengroep('') }
            }}
            className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Toevoegen
          </button>
        </div>
      </div>

      {/* Categorieën */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Categorieën recepten</h3>
        <p className="text-xs text-slate-400 mb-4">
          Beschikbare categorieën voor het indelen van recepten in de bibliotheek.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {categorieen.map(c => (
            <div key={c} className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2.5 py-1">
              <span className="text-sm text-slate-700">{c}</span>
              <button onClick={() => setCategorieen(prev => prev.filter(x => x !== c))} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text" value={nieuwCategorie}
            onChange={e => setNieuwCategorie(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && nieuwCategorie.trim() && !categorieen.includes(nieuwCategorie.trim())) {
                setCategorieen(prev => [...prev, nieuwCategorie.trim()]); setNieuwCategorie('')
              }
            }}
            placeholder="bijv. Stukadoorswerk"
            className="w-48 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
          <button
            onClick={() => {
              if (nieuwCategorie.trim() && !categorieen.includes(nieuwCategorie.trim())) {
                setCategorieen(prev => [...prev, nieuwCategorie.trim()]); setNieuwCategorie('')
              }
            }}
            className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Toevoegen
          </button>
        </div>
      </div>

      {/* Kolomnamen */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Kolomnamen</h3>
        <p className="text-xs text-slate-400 mb-4">
          Laat een veld leeg om de standaardnaam te gebruiken.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 pb-2 w-1/2">Standaard</th>
              <th className="text-left text-xs font-medium text-slate-500 pb-2 w-1/2">Aangepast</th>
            </tr>
          </thead>
          <tbody>
            {KOLOM_STANDAARD.map(({ id, label }) => (
              <tr key={id} className="border-b border-slate-50">
                <td className="py-1.5 pr-4 text-slate-600 text-xs ">{label}</td>
                <td className="py-1">
                  <input
                    type="text"
                    value={kolomNamen[id] ?? ''}
                    placeholder={label}
                    onChange={e => setKolomNamen(prev => ({ ...prev, [id]: e.target.value }))}
                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-everts/30 focus:border-everts"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={opslaan}
        className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
      >
        <Save className="w-4 h-4" />
        Calculatie-instellingen opslaan
      </button>
    </div>
  )
}

// ─── Tab: Offerte instellingen ────────────────────────────────────────────────

function OfferteTab() {
  const secties = [
    { href: '/instellingen/offerte-layout',        label: 'Offerte layout',       sub: 'Word-sjablonen met huisstijl voor offertes' },
    { href: '/instellingen/betalingscondities',    label: 'Betalingscondities',   sub: 'Termijnschema\'s voor de aanneemsom' },
    { href: '/instellingen/algemene-voorwaarden',  label: 'Algemene Voorwaarden', sub: 'PDF-documenten met algemene voorwaarden' },
    { href: '/instellingen/btw-tarieven',          label: 'BTW tarieven',         sub: 'Beschikbare BTW-percentages' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Offerte-instellingen worden centraal beheerd in de EVA-bedrijfsinstellingen.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {secties.map(({ href, label, sub }) => (
          <Link
            key={label}
            href={href}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:border-everts/40 transition-colors group flex items-start justify-between"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-slate-800 text-sm">{label}</div>
                <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-everts mt-0.5 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
