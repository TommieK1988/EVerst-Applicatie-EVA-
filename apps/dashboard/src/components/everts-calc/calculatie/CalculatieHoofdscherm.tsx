'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  GitBranch, Ruler, CloudUpload, Check, Undo2,
  ChevronsUp, Keyboard, BookOpen, Paintbrush, Package, X,
  FileUp, FileDown, ChevronDown, Library, Table2,
  SlidersHorizontal, FileText, ClipboardList, Receipt, Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import toast from 'react-hot-toast'
import StructuurBoom from './StructuurBoom'
import CalculatieGrid, { type CalculatieGridHandle } from './CalculatieGrid'
import TotalsBar from './TotalsBar'
import BibliotheekDrawer from './BibliotheekDrawer'
import CufImportModal from './CufImportModal'
import CalculatieInstellingenKaarten from './CalculatieInstellingenKaarten'
import OfferteAanmakenModal from '@/components/everts-calc/quotes/OfferteAanmakenModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import { serialiseerNaarCuf } from '@/lib/everts-calc/cuf-serializer'
import { exportCalculatieNaarExcel } from '@/lib/everts-calc/excel-export'
import {
  getScenarios, getScenario, maakStandaardScenario, slaScenarioOp,
  getGroepen, getCalculatieregels, getComponentregels,
} from '@/lib/everts-calc/local-store'
import { reviseerCalculatie } from '@/lib/everts-calc/versie'
import { resetDossierNaarAanvraagBijRevisie } from '@/lib/dossiers/actions'
import { berekenScenarioKostprijs, berekenScenarioVP } from '@/lib/everts-calc/calculations'
import { syncCalculatieNaarSupabase, bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { reserveerOfferteNummer } from '@/app/(platform)/everts-calc/actions/quotes'
import { verzamelSyncData, verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import type { Scenario, BibliotheekItemVereenvoudigd, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

interface Props {
  projectId: string
  projectNaam: string
  projectNummer: string
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  toonProjectDetail?: boolean
  readOnly?: boolean
  /** Specifiek scenario (calculatie) openen. Zonder dit → standaard/eerste scenario. */
  scenarioId?: string
  /** Dossier-context — aanwezig wanneer de calculatie binnen een dossier draait.
   *  Activeert de offerte-functies (Offerte aanmaken / Interne begroting) in het
   *  Opties-menu. */
  dossierContext?: {
    dossierId: string
    clientNaam?: string | null
  }
  /** Aangeroepen na een wijziging in de set scenario's (bijv. na kopiëren). De
   *  optionele parameter is het id van een nieuw/te-openen scenario. */
  onScenariosGewijzigd?: (nieuwScenarioId?: string) => void
  /** Of reviseren toegestaan is. In de Opdracht-fase mag een verzonden offerte
   *  niet meer gereviseerd worden (Bouw7 is dan leidend). */
  magReviseren?: boolean
}

export default function CalculatieHoofdscherm({
  projectId, projectNaam, projectNummer,
  bibliotheekItems = [], readOnly: readOnlyProp = false, scenarioId, dossierContext,
  onScenariosGewijzigd, magReviseren = true,
}: Props) {
  const pathname = usePathname()
  const [scenario, setScenario]                       = useState<Scenario | null>(null)
  // Een verzonden (definitieve) calculatie is bevroren: read-only, ook als het
  // dossier zelf bewerkbaar is. Zo kan een verzonden versie nooit wijzigen.
  const readOnly = readOnlyProp || !!scenario?.bevroren_op
  const [actiefGroepId, setActiefGroepId]             = useState<string | null>(null)
  const [refreshTotalen, setRefreshTotalen]           = useState(0)
  const [kostprijs, setKostprijs]                     = useState(0)
  const [verkoopprijs, setVerkoopprijs]               = useState(0)
  const [regelsVoorBtw, setRegelsVoorBtw]             = useState<Calculatieregel[]>([])
  const [componentenVoorBtw, setComponentenVoorBtw]   = useState<Componentregel[]>([])
  const [boomUitgeklapt, setBoomUitgeklapt]           = useState(false)
  /** Er wordt een groep versleept in de boom — het paneel mag dan niet dichtklappen. */
  const [boomSleepActief, setBoomSleepActief]         = useState(false)
  const [syncStatus, setSyncStatus]                   = useState<'idle' | 'bezig' | 'gelukt' | 'fout'>('idle')
  const [undoCount, setUndoCount]                     = useState(0)
  const [receptenOpen, setReceptenOpen]               = useState(false)
  const [schilderwerkOpen, setSchilderwerkOpen]       = useState(false)
  const [materialenOpen, setMaterialenOpen]           = useState(false)
  const [toonCufImport, setToonCufImport]             = useState(false)
  const [offerteModalOpen, setOfferteModalOpen]       = useState(false)
  const [offerteModalType, setOfferteModalType]       = useState<QuoteType>('verkoopofferte')
  const [instellingenOpen, setInstellingenOpen]       = useState(false)
  const [instellingenVereist, setInstellingenVereist] = useState(false)
  const [pendingOfferteType, setPendingOfferteType]   = useState<QuoteType | null>(null)
  const sluitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridRef       = useRef<CalculatieGridHandle>(null)

  /* ── Boom-hover handlers ─────────────────────────────────────────── */
  const handleBoomEnter = useCallback(() => {
    if (sluitTimerRef.current) clearTimeout(sluitTimerRef.current)
    setBoomUitgeklapt(true)
  }, [])

  const handleBoomLeave = useCallback(() => {
    // Tijdens het slepen niet sluiten: de browser stuurt bij dragstart een mouseleave,
    // en een verdwijnend paneel breekt de sleep af omdat het sleepelement verdwijnt.
    if (boomSleepActief) return
    sluitTimerRef.current = setTimeout(() => setBoomUitgeklapt(false), 350)
  }, [boomSleepActief])

  const handleSluitBoom = useCallback(() => setBoomUitgeklapt(false), [])

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
    if (scenarioId) {
      // Specifiek scenario openen (uit de calculaties-tabel); fallback op standaard.
      setScenario(scs.find(s => s.id === scenarioId) ?? scs.find(s => s.is_standaard) ?? scs[0] ?? null)
    } else if (scs.length === 0) {
      setScenario(maakStandaardScenario(projectId))
    } else {
      setScenario(scs.find(s => s.is_standaard) ?? scs[0])
    }
  }, [projectId, scenarioId])

  /* ── Offertenummer reserveren zodra een calculatie er nog geen heeft ── */
  useEffect(() => {
    if (!scenario || scenario.nummer) return
    const sid = scenario.id
    let geannuleerd = false
    reserveerOfferteNummer().then(nr => {
      if (geannuleerd || !nr) return   // scenario gewisseld → deze reservering vervalt
      const huidige = getScenario(sid)  // vers uit het werkgeheugen, om edits niet te overschrijven
      if (!huidige || huidige.nummer) return
      const bijgewerkt = { ...huidige, nummer: nr }
      slaScenarioOp(bijgewerkt)
      setScenario(prev => (prev && prev.id === sid ? bijgewerkt : prev))
      onScenariosGewijzigd?.()
    })
    return () => { geannuleerd = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id, scenario?.nummer])

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

  /* ── Opslaan (automatisch + handmatig) ───────────────────────────── */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef     = useRef(false)

  // Kernsave: schrijft de genormaliseerde projectie (werkbegroting/rapportage) én
  // de verliesloze editor-snapshot (cross-device) weg. `stil` = auto-save zonder
  // succes-toast; fouten worden altijd getoond.
  const slaCalculatieOp = useCallback(async (stil = false) => {
    if (!scenario || readOnly) return
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dirtyRef.current = false
    setSyncStatus('bezig')
    try {
      const { groepen, regels } = verzamelSyncData(scenario.id)
      const [resultaat, snapRes] = await Promise.all([
        syncCalculatieNaarSupabase(projectId, groepen, regels),
        bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId)),
      ])
      if (resultaat.gelukt && snapRes.gelukt) {
        setSyncStatus('gelukt')
        if (!stil) toast.success(`Opgeslagen: ${resultaat.groepen_geschreven} groepen, ${resultaat.regels_geschreven} regels`)
        setTimeout(() => setSyncStatus('idle'), stil ? 1500 : 3000)
      } else {
        setSyncStatus('fout')
        toast.error(resultaat.fout ?? snapRes.fout ?? 'Opslaan mislukt')
        setTimeout(() => setSyncStatus('idle'), 4000)
      }
    } catch (err) {
      setSyncStatus('fout')
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
      setTimeout(() => setSyncStatus('idle'), 4000)
    }
  }, [scenario, projectId, readOnly])

  // Altijd de actuele save-functie beschikbaar voor debounce/flush (geen stale closure).
  const saveRef = useRef(slaCalculatieOp)
  useEffect(() => { saveRef.current = slaCalculatieOp }, [slaCalculatieOp])

  // Debounced auto-save: elke wijziging plant ~1,5s later een stille opslag. Zo hoeft
  // de gebruiker niet op Opslaan te klikken en blijft de gedeelde snapshot actueel.
  const planAutoSave = useCallback(() => {
    if (readOnly) return
    dirtyRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void saveRef.current(true)
    }, 1500)
  }, [readOnly])

  // Nog-niet-weggeschreven wijziging direct flushen bij tab-wissel of verlaten van
  // het scherm, zodat de laatste edit niet in de debounce blijft hangen (en de
  // re-hydratie bij heropenen niet een oudere snapshot terugzet).
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
      void saveRef.current(true)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    // Bij herladen/sluiten is er geen tijd meer om de opslag af te maken, en de
    // calculatie leeft alleen in het werkgeheugen — dus expliciet waarschuwen.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      flush()
    }
  }, [])

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

  const handleWijziging = () => {
    setRefreshTotalen(r => r + 1)
    planAutoSave()
  }

  const handleScenarioWijzig = (patch: Partial<Scenario>) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
    planAutoSave()
  }

  /** Start het aanmaken van een offerte/begroting. Vereist eerst een gekozen
   *  betalingsconditie én algemene voorwaarden op de calculatie; anders opent
   *  eerst het instellingen-dialoog (verplicht-modus). */
  const startOfferte = (type: QuoteType) => {
    const scs = getScenarios(projectId)
    const actief = scs.find(s => s.is_standaard) ?? scs[0]
    if (!actief?.betalingsconditie_id || !actief?.algemene_voorwaarden_id) {
      setPendingOfferteType(type)
      setInstellingenVereist(true)
      setInstellingenOpen(true)
    } else {
      setOfferteModalType(type)
      setOfferteModalOpen(true)
    }
  }

  /** Beide keuzes gemaakt in verplicht-modus → door naar het offerte-dialoog. */
  const handleInstellingenVoltooid = () => {
    const type = pendingOfferteType
    setInstellingenOpen(false)
    setInstellingenVereist(false)
    setPendingOfferteType(null)
    if (type) { setOfferteModalType(type); setOfferteModalOpen(true) }
  }

  /** Reviseren: maakt een nieuwe, bewerkbare versie van deze (definitieve)
   *  calculatie en opent die. De offerte maak je daarna opnieuw. */
  const handleReviseer = async () => {
    if (!scenario) return
    const nieuw = await reviseerCalculatie(projectId, scenario.id)
    if (!nieuw) { toast.error('Reviseren mislukt'); return }
    // Zet het gekoppelde dossier terug naar Aanvraag · Nieuw (aanvraag-fase, of een
    // EVA-gedreven offerte zonder Bouw7-koppeling). Fail-soft: revisie is al gelukt.
    if (dossierContext) {
      try {
        const res = await resetDossierNaarAanvraagBijRevisie(projectId)
        if (res.ok && res.gewijzigd) toast.success('Dossier teruggezet naar Aanvraag · Nieuw')
      } catch { /* niet blokkerend */ }
    }
    toast.success('Nieuwe versie aangemaakt')
    onScenariosGewijzigd?.(nieuw.id)
  }

  const ddItem = 'flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer outline-none rounded-md'

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] bg-slate-50">

      {/* ─── Bevroren banner ── */}
      {readOnly && (
        <Alert tone="warning" title="Calculatie bevroren" className="rounded-none border-x-0 border-t-0 flex-shrink-0">
          {scenario?.bevroren_op
            ? 'De offerte van deze versie is verzonden (definitief). De calculatie is alleen-lezen — reviseer om een nieuwe versie te maken.'
            : 'De calculatie is alleen-lezen.'}
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
              onClick={handleBoomEnter}
              title="Structuur van de calculatie"
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

            {/* Opslaan — wijzigingen worden automatisch opgeslagen; deze knop
                forceert een directe opslag en toont de status. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => slaCalculatieOp(false)}
              disabled={syncStatus === 'bezig' || readOnly}
              loading={syncStatus === 'bezig'}
              title={readOnly ? 'Bevroren' : 'Wijzigingen worden automatisch opgeslagen — klik om nu op te slaan'}
              className={
                syncStatus === 'gelukt' ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-50 hover:border-green-200' :
                syncStatus === 'fout'   ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-50 hover:border-red-200' :
                undefined
              }
            >
              {syncStatus !== 'bezig' && (
                syncStatus === 'gelukt'
                  ? <Check className="w-3.5 h-3.5" />
                  : <CloudUpload className="w-3.5 h-3.5" />
              )}
              <span className="hidden lg:inline">
                {syncStatus === 'bezig' ? 'Opslaan…' :
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
                        <td className="px-4 py-1.5  font-medium text-slate-800 whitespace-nowrap">{keys}</td>
                        <td className="px-4 py-1.5 text-slate-500">{label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rechtercluster: kolom-layouts + kolommen (gerenderd vanuit het grid via
                portal in #calc-grid-toolbar-slot) naast Opties. */}
            <div className="ml-auto flex items-center gap-2">
              <div id="calc-grid-toolbar-slot" className="flex items-center gap-2" />

            {/* Opties dropdown — helemaal rechts */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" size="sm" title="Opties — offerte, betalingscondities, import/export">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Opties</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[200px] z-[200]"
                  align="end" sideOffset={4}
                >
                  {/* Offerte-functies — alleen binnen een dossier en niet in alleen-lezen. */}
                  {dossierContext && !readOnly && (
                    <>
                      <DropdownMenu.Item className={ddItem} onSelect={() => startOfferte('verkoopofferte')}>
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Offerte aanmaken
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={ddItem} onSelect={() => startOfferte('interne_calculatie')}>
                        <ClipboardList className="w-3.5 h-3.5 text-slate-400" /> Interne begroting
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                    </>
                  )}
                  {/* Betalingscondities + Algemene voorwaarden (per calculatie/offerte). */}
                  <DropdownMenu.Item
                    className={ddItem}
                    onSelect={() => { setInstellingenVereist(false); setInstellingenOpen(true) }}
                    disabled={readOnly}
                  >
                    <Receipt className="w-3.5 h-3.5 text-slate-400" /> Betalingscondities &amp; voorwaarden
                  </DropdownMenu.Item>
                  {scenario?.bevroren_op && magReviseren && (
                    <DropdownMenu.Item className={ddItem} onSelect={handleReviseer}>
                      <Copy className="w-3.5 h-3.5 text-slate-400" /> Reviseren (nieuwe versie)
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                  <DropdownMenu.Item className={ddItem} onSelect={() => setToonCufImport(true)}>
                    <FileUp className="w-3.5 h-3.5 text-slate-400" /> Importeren (CUF / C4Y)
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={handleCufExport}>
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> CUF exporteren
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={handleExcelExport}>
                    <Table2 className="w-3.5 h-3.5 text-green-600" /> Excel exporteren
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            </div>
      </div>

      {/* ─── Boom + Grid ── */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* StructuurBoom flyout (overlay, niet fixed) */}
        <aside
          className={`absolute left-0 top-0 h-full z-50 flex flex-col bg-white border-r border-slate-200 shadow-xl transition-all duration-200 ${
            boomUitgeklapt
              ? 'w-80 xl:w-[26rem] opacity-100'
              : 'w-0 overflow-hidden opacity-0 pointer-events-none'
          }`}
          onMouseEnter={handleBoomEnter}
          onMouseLeave={handleBoomLeave}
          // Tweede vangnet: zolang er iets over het paneel gesleept wordt, blijft het open,
          // ook als er onverhoopt toch een sluittimer liep.
          onDragOver={handleBoomEnter}
          onDragEnter={handleBoomEnter}
        >
          <div className="flex items-center border-b border-slate-200 h-9 flex-shrink-0">
            <span className="text-xs text-slate-500 font-medium px-3 flex-1 truncate">Structuur</span>
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
              onVoorWijziging={() => gridRef.current?.duwSnapshot()}
              onSleepActief={setBoomSleepActief}
              readOnly={readOnly}
            />
          </div>
        </aside>

        {/* Grid */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-w-0 relative"
          onMouseDown={() => { if (boomUitgeklapt) handleSluitBoom() }}
        >
          <CalculatieGrid
            ref={gridRef}
            scenarioId={scenario.id}
            scenario={scenario}
            actiefGroepId={actiefGroepId}
            onGroepActief={setActiefGroepId}
            onWijziging={handleWijziging}
            onUndoCountChange={setUndoCount}
            bibliotheekItems={bibliotheekItems}
            readOnly={readOnly}
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
          onImport={() => { setToonCufImport(false); handleWijziging(); toast.success('Calculatie geïmporteerd') }}
        />
      )}

      {/* Offerte / interne begroting aanmaken vanuit de calculatie (dossier-context). */}
      {dossierContext && offerteModalOpen && (
        <OfferteAanmakenModal
          open={offerteModalOpen}
          onClose={() => setOfferteModalOpen(false)}
          projectId={projectId}
          scenarioId={scenario.id}
          dossierId={dossierContext.dossierId}
          projectNaam={projectNaam}
          clientNaam={dossierContext.clientNaam ?? ''}
          projectNummer={projectNummer}
          type={offerteModalType}
          meerwerkRegelId={scenario.meerwerk_regel_id ?? null}
          terugNaarUrl={pathname}
        />
      )}

      {/* Betalingscondities & Algemene voorwaarden — per calculatie/offerte (scenario). */}
      <Dialog
        open={instellingenOpen}
        onOpenChange={(o) => {
          setInstellingenOpen(o)
          if (!o) { setInstellingenVereist(false); setPendingOfferteType(null) }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Betalingscondities &amp; voorwaarden</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-slate-500 mb-3">
              Deze keuze geldt voor deze calculatie en wordt overgenomen op offertes die je hiervan aanmaakt.
            </p>
            <CalculatieInstellingenKaarten
              projectId={projectId}
              vereist={instellingenVereist}
              onVoltooid={handleInstellingenVoltooid}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
