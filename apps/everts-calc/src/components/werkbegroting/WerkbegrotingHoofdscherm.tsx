'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, ChevronLeft, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import {
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie,
  getWerkbegrotingRegels, getWerkbegrotingComponenten, getWerkbegrotingWijzigingen,
  getWerkbegrotingBestellingen, slaWerkbegrotingOp, getScenarios, getProject,
} from '@/lib/local-store'
import { syncWerkbegrotingNaarSupabase, syncBestellingenNaarSupabase } from '@/app/actions/werkbegroting'
import type { Werkbegroting } from '@/lib/types'
import WerkbegrotingGrid from './WerkbegrotingGrid'

interface Props {
  projectId: string
  projectNaam: string
  projectNummer: string
  projectStatus: string
}

export default function WerkbegrotingHoofdscherm({ projectId, projectNaam, projectNummer, projectStatus }: Props) {
  const [wb, setWb] = useState<Werkbegroting | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [refreshTeller, setRefreshTeller] = useState(0)

  // Laad of maak werkbegroting bij opstarten
  useEffect(() => {
    const scenarios = getScenarios(projectId)
    const standaard = scenarios.find(s => s.is_standaard) ?? scenarios[0]
    if (!standaard) return

    setScenarioId(standaard.id)

    // Werkbegroting mag pas aangemaakt worden als status gewonnen of verder
    const toegestaneStatussen = ['gewonnen', 'uitvoering', 'afgerond']
    if (!toegestaneStatussen.includes(projectStatus)) return

    const bestaand = getWerkbegrotingVoorScenario(standaard.id)
    if (bestaand) {
      setWb(bestaand)
    } else {
      const nieuw = maakWerkbegrotingVanCalculatie(projectId, standaard.id)
      setWb(nieuw)
    }
  }, [projectId, projectStatus])

  const handleWijziging = useCallback(() => {
    setRefreshTeller(t => t + 1)
  }, [])

  const handleSync = useCallback(async () => {
    if (!wb || !scenarioId) return
    setIsSyncing(true)
    try {
      const regels = getWerkbegrotingRegels(wb.id)
      const componentIds = new Set(regels.map(r => r.id))
      const componenten = getWerkbegrotingComponenten().filter(c => componentIds.has(c.werkbegroting_regel_id))
      const wijzigingen = getWerkbegrotingWijzigingen()
      const bestellingen = getWerkbegrotingBestellingen(wb.id)

      const resultaat = await syncWerkbegrotingNaarSupabase(wb, regels, componenten, wijzigingen)
      if (bestellingen.length > 0) {
        await syncBestellingenNaarSupabase(bestellingen)
      }

      if (resultaat.gelukt) {
        const bijgewerkt: Werkbegroting = { ...wb, bijgewerkt_op: new Date().toISOString() }
        slaWerkbegrotingOp(bijgewerkt)
        setWb(bijgewerkt)
        toast.success(`Werkbegroting opgeslagen (${resultaat.regels_geschreven} regels)`)
      } else {
        toast.error(`Opslaan mislukt: ${resultaat.fout}`)
      }
    } finally {
      setIsSyncing(false)
    }
  }, [wb, scenarioId])

  const toegestaneStatussen = ['gewonnen', 'uitvoering', 'afgerond']
  const magAanmaken = toegestaneStatussen.includes(projectStatus)

  if (!magAanmaken) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
        <Clock className="w-10 h-10 text-slate-300" />
        <div className="text-center">
          <p className="font-semibold text-slate-700">Werkbegroting nog niet beschikbaar</p>
          <p className="text-sm mt-1">De werkbegroting kan pas aangemaakt worden nadat de offerte gewonnen is.</p>
        </div>
        <Link href={`/projecten/${projectId}/calculatie`} className="text-sm text-everts hover:underline">
          Terug naar calculatie
        </Link>
      </div>
    )
  }

  if (!wb || !scenarioId) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Werkbegroting laden…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white sticky top-0 z-20">
        <Link
          href={`/projecten/${projectId}/calculatie`}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Terug naar calculatie"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-mono">{projectNummer}</p>
          <h1 className="text-sm font-semibold text-slate-800 truncate">{projectNaam} — Werkbegroting</h1>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          wb.status === 'geaccordeerd' ? 'bg-green-100 text-green-700' :
          wb.status === 'definitief'   ? 'bg-blue-100 text-blue-700' :
                                         'bg-amber-100 text-amber-700'
        }`}>
          {wb.status === 'geaccordeerd' ? 'Geaccordeerd' : wb.status === 'definitief' ? 'Definitief' : 'Concept'}
        </span>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            bg-everts text-white hover:bg-everts/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Opslaan
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        <WerkbegrotingGrid
          werkbegrotingId={wb.id}
          scenarioId={scenarioId}
          onWijziging={handleWijziging}
        />
      </div>
    </div>
  )
}
