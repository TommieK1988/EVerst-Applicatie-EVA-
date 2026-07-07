'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import {
  Save, Plus, X, FileText, ChevronRight, Calculator, Package,
} from 'lucide-react'
import { getInstellingen, slaInstellingenOp, hydrateInstellingen } from '@/lib/everts-calc/local-store'
import { getCalcInstellingen } from '@/app/(platform)/everts-calc/actions/calc-instellingen'
import type { EenheidConfig } from '@/lib/everts-calc/types'
import DicoIntegratiesBeheer from './DicoIntegratiesBeheer'
import ProductgroepKoppeling from '@/components/everts-calc/bibliotheek/ProductgroepKoppeling'
import MateriaalgroepenBeheer from '@/components/everts-calc/bibliotheek/MateriaalgroepenBeheer'

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
      {activeTab === 'materialen' && (
        <div className="space-y-6">
          <MateriaalgroepenBeheer />
          <DicoIntegratiesBeheer />
          <ProductgroepKoppeling />
        </div>
      )}

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

  const [eenheden, setEenheden] = useState<EenheidConfig[]>(
    () => inst.eenheden ?? []
  )
  const [categorieen, setCategorieen] = useState<string[]>(
    () => inst.categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
  )
  const [kolomNamen, setKolomNamen] = useState<Record<string, string>>(
    () => (inst.kolom_namen ?? {}) as Record<string, string>
  )
  const [nieuwEenheidAfk,   setNieuwEenheidAfk]   = useState('')
  const [nieuwEenheidOms,   setNieuwEenheidOms]   = useState('')
  const [nieuwCategorie,    setNieuwCategorie]    = useState('')
  const [kostengroepen,     setKostengroepen]     = useState<string[]>(
    () => inst.standaard_kostengroepen ?? ['Bouwplaats', 'Bereikbaarheid', 'Arbeid', 'Materieel', 'Onderaanneming']
  )
  const [nieuwKostengroep,  setNieuwKostengroep]  = useState('')

  // De editor moet de authoritative Supabase-stand tonen. De synchrone init hierboven
  // gebruikt de localStorage-cache voor een snelle eerste render; deze effect herlaadt
  // uit Supabase zodra beschikbaar (voorkomt dat verse apparaten defaults overschrijven).
  useEffect(() => {
    let actief = true
    getCalcInstellingen()
      .then(data => {
        if (!actief) return
        hydrateInstellingen(data)
        const fresh = getInstellingen()
        setEenheden(fresh.eenheden ?? [])
        setCategorieen(fresh.categorieen ?? [])
        setKolomNamen((fresh.kolom_namen ?? {}) as Record<string, string>)
        setKostengroepen(fresh.standaard_kostengroepen ?? [])
      })
      .catch(() => { /* offline: cache-init blijft staan */ })
    return () => { actief = false }
  }, [])

  const opslaan = () => {
    const schoonKolomNamen = Object.fromEntries(
      Object.entries(kolomNamen).filter(([, v]) => v.trim() !== '')
    )
    slaInstellingenOp({
      ...getInstellingen(),   // verse basis (btw, uurtarieven, categorieCodes)
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

      {/* Eenheden */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Eenheden</h3>
        <p className="text-xs text-slate-400 mb-4">
          Beschikbare eenheden voor recepten en het calculatiegrid. Elke eenheid heeft een korte
          afkorting (getoond in het grid) en een volledige omschrijving. De afkortingen{' '}
          <strong>STP</strong> en <strong>VRR</strong> zetten in het grid automatisch het vinkje{' '}
          <em>Stelpost</em> resp. <em>Verrekenbaar</em> aan.
        </p>

        <div className="space-y-2 mb-3">
          {eenheden.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={e.afkorting}
                onChange={ev => {
                  const v = ev.target.value
                  setEenheden(prev => prev.map((x, j) => j === i ? { ...x, afkorting: v } : x))
                }}
                placeholder="Afk."
                className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
              />
              <input
                type="text"
                value={e.omschrijving}
                onChange={ev => {
                  const v = ev.target.value
                  setEenheden(prev => prev.map((x, j) => j === i ? { ...x, omschrijving: v } : x))
                }}
                placeholder="Volledige omschrijving"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
              />
              <button
                onClick={() => setEenheden(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-500 transition-colors p-2"
                title="Eenheid verwijderen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {eenheden.length === 0 && (
            <span className="text-xs text-slate-400 italic">Nog geen eenheden aangemaakt</span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          {(() => {
            const voegToe = () => {
              const afk = nieuwEenheidAfk.trim()
              if (!afk || eenheden.some(x => x.afkorting.toLowerCase() === afk.toLowerCase())) return
              setEenheden(prev => [...prev, { afkorting: afk, omschrijving: nieuwEenheidOms.trim() || afk }])
              setNieuwEenheidAfk(''); setNieuwEenheidOms('')
            }
            return (
              <>
                <input
                  type="text" value={nieuwEenheidAfk}
                  onChange={e => setNieuwEenheidAfk(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') voegToe() }}
                  placeholder="Afk. (bijv. raam)"
                  className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <input
                  type="text" value={nieuwEenheidOms}
                  onChange={e => setNieuwEenheidOms(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') voegToe() }}
                  placeholder="Omschrijving (bijv. Per raam)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <button
                  onClick={voegToe}
                  className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" /> Toevoegen
                </button>
              </>
            )
          })()}
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
