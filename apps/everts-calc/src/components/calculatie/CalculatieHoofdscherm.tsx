'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Ruler, CloudUpload, Check, Loader2, Undo2, ChevronsUp, FileUp, FileDown, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import StructuurBoom from './StructuurBoom'
import CalculatieGrid, { type CalculatieGridHandle } from './CalculatieGrid'
import TotalsBar from './TotalsBar'
import CufImportModal from './CufImportModal'
import { getScenarios, maakStandaardScenario, slaScenarioOp, getGroepen, getCalculatieregels, getComponentregels } from '@/lib/local-store'
import { berekenScenarioKostprijs, berekenScenarioVP } from '@/lib/calculations'
import { syncCalculatieNaarSupabase } from '@/app/actions/sync'
import { verzamelSyncData } from '@/lib/sync-utils'
import { serialiseerNaarCuf } from '@/lib/cuf-serializer'
import type { Scenario, BibliotheekItemVereenvoudigd, Calculatieregel, Componentregel } from '@/lib/types'

interface Props {
  projectId: string
  projectNaam: string
  projectNummer: string
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
}

export default function CalculatieHoofdscherm({ projectId, projectNaam, projectNummer, bibliotheekItems = [] }: Props) {
  const [scenario, setScenario]             = useState<Scenario | null>(null)
  const [actiefGroepId, setActiefGroepId]   = useState<string | null>(null)
  const [refreshTotalen, setRefreshTotalen] = useState(0)
  const [kostprijs, setKostprijs]           = useState(0)
  const [verkoopprijs, setVerkoopprijs]     = useState(0)
  const [regelsVoorBtw, setRegelsVoorBtw]   = useState<Calculatieregel[]>([])
  const [componentenVoorBtw, setComponentenVoorBtw] = useState<Componentregel[]>([])
  const [boomUitgeklapt, setBoomUitgeklapt] = useState(true)
  const [syncStatus, setSyncStatus]         = useState<'idle' | 'bezig' | 'gelukt' | 'fout'>('idle')
  const [undoCount, setUndoCount]           = useState(0)
  const [toonCufImport, setToonCufImport]   = useState(false)
  const [isPending, startTransition]        = useTransition()
  const gridRef = useRef<CalculatieGridHandle>(null)

  const toggleBoom = () => setBoomUitgeklapt(v => !v)

  useEffect(() => {
    const scs = getScenarios(projectId)
    if (scs.length === 0) {
      const nieuw = maakStandaardScenario(projectId)
      setScenario(nieuw)
    } else {
      setScenario(scs.find(s => s.is_standaard) ?? scs[0])
    }
  }, [projectId])

  useEffect(() => {
    if (!scenario) return
    const gs = getGroepen(scenario.id)
    const groepIds = new Set(gs.map(g => g.id))
    const rs = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds = new Set(rs.map(r => r.id))
    const cs = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
    setKostprijs(berekenScenarioKostprijs(gs, rs, cs))
    setVerkoopprijs(berekenScenarioVP(gs, rs, cs, scenario.opslag_algemene_kosten))
    setRegelsVoorBtw(rs)
    setComponentenVoorBtw(cs)
  }, [refreshTotalen, scenario])

  if (!scenario) return null

  const handleWijziging = () => setRefreshTotalen(r => r + 1)

  const handleScenarioWijzig = (patch: Partial<Scenario>) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
  }

  const handleSync = () => {
    setSyncStatus('bezig')
    startTransition(async () => {
      try {
        const { groepen, regels } = verzamelSyncData(scenario.id)
        const resultaat = await syncCalculatieNaarSupabase(projectId, groepen, regels)
        if (resultaat.gelukt) {
          setSyncStatus('gelukt')
          toast.success(`Opgeslagen: ${resultaat.groepen_geschreven} groepen, ${resultaat.regels_geschreven} regels`)
          setTimeout(() => setSyncStatus('idle'), 3000)
        } else {
          setSyncStatus('fout')
          toast.error(resultaat.fout ?? 'Sync mislukt')
          setTimeout(() => setSyncStatus('idle'), 4000)
        }
      } catch (err) {
        setSyncStatus('fout')
        toast.error(err instanceof Error ? err.message : 'Sync mislukt')
        setTimeout(() => setSyncStatus('idle'), 4000)
      }
    })
  }

  const handleUndo = () => {
    gridRef.current?.undo()
  }

  const handleCollapseAll = () => {
    gridRef.current?.collapseAll()
  }

  const handleCufExport = () => {
    if (!scenario) return
    try {
      const groepen              = getGroepen(scenario.id)
      const groepIds             = new Set(groepen.map(g => g.id))
      const calculatieregels     = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
      const calculatieregelIds   = new Set(calculatieregels.map(r => r.id))
      const componentregels      = getComponentregels().filter(c => calculatieregelIds.has(c.calculatieregel_id))

      const xml = serialiseerNaarCuf(
        projectNaam,
        projectNummer,
        groepen,
        calculatieregels,
        componentregels,
        scenario,
      )

      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `calculatie-${projectNummer || projectNaam || 'export'}.xml`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CUF-bestand gedownload')
    } catch (err) {
      toast.error('Exporteren mislukt: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 flex flex-col z-30 bg-slate-50">

      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <Link
          href={`/projecten/${projectId}`}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {projectNummer && (
              <span className="text-xs text-slate-400 font-mono">{projectNummer}</span>
            )}
            {projectNummer && <span className="text-slate-300">·</span>}
            <h1 className="font-semibold text-slate-800 text-sm truncate">{projectNaam}</h1>
          </div>
        </div>

        {/* Inklappen knop */}
        <button
          onClick={handleCollapseAll}
          title="Alle groepen inklappen"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors flex-shrink-0 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inklappen</span>
        </button>

        {/* Undo knop */}
        <button
          onClick={handleUndo}
          disabled={undoCount === 0}
          title={undoCount > 0 ? `Ongedaan maken (${undoCount} stap${undoCount !== 1 ? 'pen' : ''})` : 'Niets om ongedaan te maken'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:hover:bg-transparent"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ongedaan{undoCount > 0 ? ` (${undoCount})` : ''}</span>
        </button>

        {/* Sync knop */}
        <button
          onClick={handleSync}
          disabled={isPending || syncStatus === 'bezig'}
          title="Calculatie opslaan naar cloud"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors flex-shrink-0 ${
            syncStatus === 'gelukt'
              ? 'border-green-200 bg-green-50 text-green-700'
              : syncStatus === 'fout'
              ? 'border-red-200 bg-red-50 text-red-600'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          {(syncStatus === 'bezig' || isPending)
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : syncStatus === 'gelukt'
            ? <Check className="w-3.5 h-3.5" />
            : <CloudUpload className="w-3.5 h-3.5" />
          }
          <span className="hidden sm:inline">
            {syncStatus === 'bezig' || isPending ? 'Bezig...'
              : syncStatus === 'gelukt' ? 'Opgeslagen'
              : syncStatus === 'fout'   ? 'Fout'
              : 'Opslaan'}
          </span>
        </button>

        {/* Meetstaat knop — opent als aparte pagina */}
        <Link
          href={`/projecten/${projectId}/meetstaat`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200
                     text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors flex-shrink-0"
          title="Schildermeetstaat openen in nieuw tabblad"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Meetstaat</span>
        </Link>

        {/* CUF dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200
                         text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors flex-shrink-0"
              title="CUF importeren of exporteren"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CUF</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[180px] z-[200]"
              align="end" sideOffset={4}
            >
              <DropdownMenu.Item
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer outline-none rounded-md"
                onSelect={() => setToonCufImport(true)}
              >
                <FileUp className="w-3.5 h-3.5 text-slate-400" /> CUF importeren
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer outline-none rounded-md"
                onSelect={handleCufExport}
              >
                <FileDown className="w-3.5 h-3.5 text-slate-400" /> CUF exporteren
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* ─── Boom + Grid ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        <aside
          className={`flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 ${
            boomUitgeklapt ? 'w-56 xl:w-64' : 'w-9'
          }`}
        >
          <div className="flex items-center border-b border-slate-200 h-9 flex-shrink-0">
            {boomUitgeklapt && (
              <span className="text-xs text-slate-500 font-medium px-3 flex-1 truncate">
                Structuur
              </span>
            )}
            <button
              onClick={toggleBoom}
              className="p-1.5 rounded-lg transition-colors ml-auto mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title={boomUitgeklapt ? 'Structuur inklappen' : 'Structuur uitklappen'}
            >
              {boomUitgeklapt
                ? <PanelLeftClose className="w-3.5 h-3.5" />
                : <PanelLeftOpen  className="w-3.5 h-3.5" />
              }
            </button>
          </div>

          {boomUitgeklapt && (
            <div className="flex-1 overflow-hidden">
              <StructuurBoom
                scenarioId={scenario.id}
                actiefGroepId={actiefGroepId}
                refreshTrigger={refreshTotalen}
                onSelecteer={setActiefGroepId}
                onWijziging={handleWijziging}
              />
            </div>
          )}
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <CalculatieGrid
            ref={gridRef}
            scenarioId={scenario.id}
            scenario={scenario}
            actiefGroepId={actiefGroepId}
            onGroepActief={setActiefGroepId}
            onWijziging={handleWijziging}
            onUndoCountChange={setUndoCount}
            bibliotheekItems={bibliotheekItems}
          />
        </div>
      </div>

      {/* ─── Totalen balk ─────────────────────────────────────────────────── */}
      <TotalsBar
        scenario={scenario}
        kostprijs_live={kostprijs}
        verkoopprijs_live={verkoopprijs}
        regels={regelsVoorBtw}
        componenten={componentenVoorBtw}
        onScenarioWijzig={handleScenarioWijzig}
      />

      {/* ─── CUF Import Modal ─────────────────────────────────────────────── */}
      {toonCufImport && (
        <CufImportModal
          scenarioId={scenario.id}
          onClose={() => setToonCufImport(false)}
          onImport={() => {
            setToonCufImport(false)
            handleWijziging()
            toast.success('CUF-bestand geïmporteerd')
          }}
        />
      )}

    </div>
  )
}
