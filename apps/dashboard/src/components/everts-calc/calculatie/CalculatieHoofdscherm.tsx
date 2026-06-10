'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  GitBranch, Pin, Ruler, CloudUpload, Check, Undo2,
  ChevronsUp, Keyboard, BookOpen, Paintbrush, Package, X,
  FileUp, FileDown, ChevronDown, Library, Table2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import toast from 'react-hot-toast'
import StructuurBoom from './StructuurBoom'
import CalculatieGrid, { type CalculatieGridHandle } from './CalculatieGrid'
import TotalsBar from './TotalsBar'
import BibliotheekDrawer from './BibliotheekDrawer'
import CufImportModal from './CufImportModal'
import { serialiseerNaarCuf } from '@/lib/everts-calc/cuf-serializer'
import { exportCalculatieNaarExcel } from '@/lib/everts-calc/excel-export'
import {
  getScenarios, maakStandaardScenario, slaScenarioOp,
  getGroepen, getCalculatieregels, getComponentregels,
} from '@/lib/everts-calc/local-store'
import { berekenScenarioKostprijs, berekenScenarioVP } from '@/lib/everts-calc/calculations'
import { syncCalculatieNaarSupabase } from '@/app/(platform)/everts-calc/actions/sync'
import { verzamelSyncData } from '@/lib/everts-calc/sync-utils'
import type { Scenario, BibliotheekItemVereenvoudigd, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

interface Props {
  projectId: string
  projectNaam: string
  projectNummer: string
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  toonProjectDetail?: boolean
  readOnly?: boolean
}

export default function CalculatieHoofdscherm({
  projectId, projectNaam, projectNummer,
  bibliotheekItems = [], readOnly = false,
}: Props) {
  const [scenario, setScenario]                       = useState<Scenario | null>(null)
  const [actiefGroepId, setActiefGroepId]             = useState<string | null>(null)
  const [refreshTotalen, setRefreshTotalen]           = useState(0)
  const [kostprijs, setKostprijs]                     = useState(0)
  const [verkoopprijs, setVerkoopprijs]               = useState(0)
  const [regelsVoorBtw, setRegelsVoorBtw]             = useState<Calculatieregel[]>([])
  const [componentenVoorBtw, setComponentenVoorBtw]   = useState<Componentregel[]>([])
  const [boomUitgeklapt, setBoomUitgeklapt]           = useState(false)
  const [boomVastgezet, setBoomVastgezet]             = useState(false)
  const [syncStatus, setSyncStatus]                   = useState<'idle' | 'bezig' | 'gelukt' | 'fout'>('idle')
  const [undoCount, setUndoCount]                     = useState(0)
  const [receptenOpen, setReceptenOpen]               = useState(false)
  const [schilderwerkOpen, setSchilderwerkOpen]       = useState(false)
  const [materialenOpen, setMaterialenOpen]           = useState(false)
  const [toonCufImport, setToonCufImport]             = useState(false)
  const [isPending, startTransition]                  = useTransition()
  const sluitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridRef       = useRef<CalculatieGridHandle>(null)

  /* ── Boom-hover handlers ─────────────────────────────────────────── */
  const handleBoomEnter = useCallback(() => {
    if (sluitTimerRef.current) clearTimeout(sluitTimerRef.current)
    setBoomUitgeklapt(true)
  }, [])

  const handleBoomLeave = useCallback(() => {
    if (boomVastgezet) return
    sluitTimerRef.current = setTimeout(() => setBoomUitgeklapt(false), 350)
  }, [boomVastgezet])

  const handlePin = useCallback(() => {
    setBoomVastgezet(v => {
      if (!v) setBoomUitgeklapt(true)
      return !v
    })
  }, [])

  const handleSluitBoom = useCallback(() => {
    setBoomUitgeklapt(false)
    setBoomVastgezet(false)
  }, [])

  const handleCollapseAll = useCallback(() => gridRef.current?.collapseAll(), [])
  const handleUndo        = useCallback(() => gridRef.current?.undo(), [])

  /* ── Escape sluit boom ───────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && boomUitgeklapt) handleSluitBoom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boomUitgeklapt, handleSluitBoom])

  /* ── Scenario laden ──────────────────────────────────────────────── */
  useEffect(() => {
    const scs = getScenarios(projectId)
    if (scs.length === 0) {
      setScenario(maakStandaardScenario(projectId))
    } else {
      setScenario(scs.find(s => s.is_standaard) ?? scs[0])
    }
  }, [projectId])

  /* ── Totalen herberekenen ────────────────────────────────────────── */
  useEffect(() => {
    if (!scenario) return
    const gs = getGroepen(scenario.id)
    const groepIds = new Set(gs.map(g => g.id))
    const rs = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds = new Set(rs.map(r => r.id))
    const cs = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
    setKostprijs(berekenScenarioKostprijs(gs, rs, cs))
    setVerkoopprijs(berekenScenarioVP(gs, rs, cs, scenario.opslag_algemene_kosten + (scenario.opslag_winst_risico ?? 0)))
    setRegelsVoorBtw(rs)
    setComponentenVoorBtw(cs)
  }, [refreshTotalen, scenario])

  /* ── Sync ────────────────────────────────────────────────────────── */
  const handleSync = useCallback(() => {
    if (!scenario) return
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
  }, [scenario, projectId, startTransition])

  const handleCufExport = useCallback(() => {
    if (!scenario) return
    try {
      const groepen            = getGroepen(scenario.id)
      const groepIds           = new Set(groepen.map(g => g.id))
      const calculatieregels   = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
      const calculatieregelIds = new Set(calculatieregels.map(r => r.id))
      const componentregels    = getComponentregels().filter(c => calculatieregelIds.has(c.calculatieregel_id))
      const xml = serialiseerNaarCuf(projectNaam, projectNummer, groepen, calculatieregels, componentregels, scenario)
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `calculatie-${projectNummer || projectNaam || 'export'}.xml`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CUF-bestand gedownload')
    } catch (err) {
      toast.error('Exporteren mislukt: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [scenario, projectNaam, projectNummer])

  const handleExcelExport = useCallback(() => {
    if (!scenario) return
    try {
      const groepen          = getGroepen(scenario.id)
      const groepIds         = new Set(groepen.map(g => g.id))
      const regels           = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
      const regelIds         = new Set(regels.map(r => r.id))
      const componenten      = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
      exportCalculatieNaarExcel(projectNaam, projectNummer, scenario, groepen, regels, componenten)
      toast.success('Excel-bestand gedownload')
    } catch (err) {
      toast.error('Excel exporteren mislukt: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [scenario, projectNaam, projectNummer])

  if (!scenario) return null

  const handleWijziging = () => setRefreshTotalen(r => r + 1)

  const handleScenarioWijzig = (patch: Partial<Scenario>) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
  }

  const ddItem = 'flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer outline-none rounded-md'

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] bg-slate-50">

      {/* ─── Bevroren banner ── */}
      {readOnly && (
        <Alert tone="warning" title="Calculatie bevroren" className="rounded-none border-x-0 border-t-0 flex-shrink-0">
          De offerte is gewonnen en omgezet naar opdracht. De calculatie is nu alleen-lezen.
        </Alert>
      )}

      {/* ─── Actiebalk ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b border-slate-200 flex-shrink-0">

            {/* Structuur toggle */}
            <Button
              variant="outline"
              size="sm"
              onMouseEnter={handleBoomEnter}
              onMouseLeave={handleBoomLeave}
              onClick={handlePin}
              className={boomVastgezet ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200' : undefined}
              title="Structuur (hover = preview, klik = vastzetten)"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Structuur</span>
            </Button>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Inklappen */}
            <Button variant="outline" size="sm" onClick={handleCollapseAll} title="Alle groepen inklappen">
              <ChevronsUp className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Inklappen</span>
            </Button>

            {/* Ongedaan */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={undoCount === 0 || readOnly}
              title={readOnly ? 'Bevroren' : undoCount > 0 ? `Ongedaan (${undoCount})` : 'Niets om ongedaan te maken'}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Ongedaan{undoCount > 0 ? ` (${undoCount})` : ''}</span>
            </Button>

            {/* Opslaan */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isPending || syncStatus === 'bezig' || readOnly}
              loading={isPending || syncStatus === 'bezig'}
              title={readOnly ? 'Bevroren' : 'Opslaan naar cloud'}
              className={
                syncStatus === 'gelukt' ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-50 hover:border-green-200' :
                syncStatus === 'fout'   ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-50 hover:border-red-200' :
                undefined
              }
            >
              {!(isPending || syncStatus === 'bezig') && (
                syncStatus === 'gelukt'
                  ? <Check className="w-3.5 h-3.5" />
                  : <CloudUpload className="w-3.5 h-3.5" />
              )}
              <span className="hidden lg:inline">
                {syncStatus === 'bezig' || isPending ? 'Bezig…' :
                 syncStatus === 'gelukt' ? 'Opgeslagen' :
                 syncStatus === 'fout'   ? 'Fout' : 'Opslaan'}
              </span>
            </Button>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Meetstaat */}
            <Button variant="outline" size="sm" asChild title="Schildermeetstaat openen">
              <a href={`/everts-calc/meetstaat/${projectId}`} target="_blank" rel="noopener noreferrer">
                <Ruler className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Meetstaat</span>
              </a>
            </Button>

            {/* CUF dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" size="sm" title="CUF importeren of exporteren">
                  <FileDown className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">CUF</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[180px] z-[200]"
                  align="start" sideOffset={4}
                >
                  <DropdownMenu.Item className={ddItem} onSelect={() => setToonCufImport(true)}>
                    <FileUp className="w-3.5 h-3.5 text-slate-400" /> CUF importeren
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={handleCufExport}>
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> CUF exporteren
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                  <DropdownMenu.Item className={ddItem} onSelect={handleExcelExport}>
                    <Table2 className="w-3.5 h-3.5 text-green-600" /> Excel exporteren
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Bibliotheek dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" size="sm" title="Bibliotheek openen">
                  <Library className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Bibliotheek</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[180px] z-[200]"
                  align="start" sideOffset={4}
                >
                  <DropdownMenu.Item className={ddItem} onSelect={() => setReceptenOpen(true)}>
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Recepten
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={() => setSchilderwerkOpen(true)}>
                    <Paintbrush className="w-3.5 h-3.5 text-slate-400" /> Schilderwerk
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={() => setMaterialenOpen(true)}>
                    <Package className="w-3.5 h-3.5 text-slate-400" /> Materialen
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Sneltoetsen */}
            <div className="relative group/keys flex-shrink-0">
              <Button variant="outline" size="sm" title="Sneltoetsen">
                <Keyboard className="w-3.5 h-3.5" />
              </Button>
              <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-lg
                              opacity-0 invisible group-hover/keys:opacity-100 group-hover/keys:visible
                              transition-all duration-150 z-[100] pointer-events-none group-hover/keys:pointer-events-auto">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Sneltoetsen</div>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {[
                      ['Ctrl+R',       'Nieuwe regel in actieve groep'],
                      ['Ctrl+G',       'Nieuwe hoofdgroep'],
                      ['Ctrl+C',       'Kopiëren'],
                      ['Ctrl+X',       'Knippen'],
                      ['Ctrl+V',       'Plakken'],
                      ['Ctrl+D',       'Dupliceren'],
                      ['Ctrl+M',       'Verplaatsen naar groep'],
                      ['Ctrl+Shift+R', 'Verwijderen'],
                      ['Ctrl+Z',       'Ongedaan maken'],
                      ['Esc',          'Selectie opheffen'],
                    ].map(([keys, label]) => (
                      <tr key={keys} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-1.5 font-mono font-medium text-slate-800 whitespace-nowrap">{keys}</td>
                        <td className="px-4 py-1.5 text-slate-500">{label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      </div>

      {/* ─── Boom + Grid ── */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* StructuurBoom flyout (overlay, niet fixed) */}
        <aside
          className={`absolute left-0 top-0 h-full z-50 flex flex-col bg-white border-r border-slate-200 shadow-xl transition-all duration-200 ${
            boomUitgeklapt
              ? 'w-56 xl:w-64 opacity-100'
              : 'w-0 overflow-hidden opacity-0 pointer-events-none'
          }`}
          onMouseEnter={handleBoomEnter}
          onMouseLeave={handleBoomLeave}
        >
          <div className="flex items-center border-b border-slate-200 h-9 flex-shrink-0">
            <span className="text-xs text-slate-500 font-medium px-3 flex-1 truncate">Structuur</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handlePin}
              className={boomVastgezet ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-50 hover:text-emerald-600' : 'text-slate-300'}
              title={boomVastgezet ? 'Losmaken' : 'Vastzetten'}
            >
              <Pin className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSluitBoom}
              className="mr-1 text-slate-300"
              title="Sluiten"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            <StructuurBoom
              scenarioId={scenario.id}
              actiefGroepId={actiefGroepId}
              refreshTrigger={refreshTotalen}
              onSelecteer={setActiefGroepId}
              onWijziging={handleWijziging}
            />
          </div>
        </aside>

        {/* Backdrop: sluit flyout bij klik op grid (alleen als niet vastgepind) */}
        {boomUitgeklapt && !boomVastgezet && (
          <div className="absolute inset-0 z-40 pointer-events-none" />
        )}

        {/* Grid */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-w-0 relative"
          onMouseDown={() => { if (boomUitgeklapt && !boomVastgezet) handleSluitBoom() }}
        >
          {readOnly && <div className="absolute inset-0 z-10 cursor-not-allowed" />}
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

        {/* Bibliotheek drawers */}
        <BibliotheekDrawer type="recepten"     open={receptenOpen}     onClose={() => setReceptenOpen(false)} />
        <BibliotheekDrawer type="schilderwerk" open={schilderwerkOpen} onClose={() => setSchilderwerkOpen(false)} />
        <BibliotheekDrawer type="materialen"   open={materialenOpen}   onClose={() => setMaterialenOpen(false)} />
      </div>

      {/* ─── Totalen balk ── */}
      <TotalsBar
        scenario={scenario}
        kostprijs_live={kostprijs}
        verkoopprijs_live={verkoopprijs}
        regels={regelsVoorBtw}
        componenten={componentenVoorBtw}
        onScenarioWijzig={handleScenarioWijzig}
      />

      {toonCufImport && (
        <CufImportModal
          scenarioId={scenario.id}
          onClose={() => setToonCufImport(false)}
          onImport={() => { setToonCufImport(false); handleWijziging(); toast.success('CUF-bestand geïmporteerd') }}
        />
      )}
    </div>
  )
}
