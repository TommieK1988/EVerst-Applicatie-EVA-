'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import BehandelingPerCodeDialoog from '@/components/everts-calc/calculatie/BehandelingPerCode'
import UrenPerGroepDialoog from '@/components/everts-calc/calculatie/UrenPerGroep'
import MeetstaatKnop from './MeetstaatKnop'
import { Alert } from '@/components/ui/alert'
import toast from 'react-hot-toast'
import StructuurBoom from './StructuurBoom'
import CalculatieGrid, { type CalculatieGridHandle } from './CalculatieGrid'
import TotalsBar from './TotalsBar'
import CalculatieWerkbalk, { type SyncStatus } from './CalculatieWerkbalk'
import type { Weergave } from './grid/weergave'
import BibliotheekDrawer from './BibliotheekDrawer'
import CufImportModal from './CufImportModal'
import CalculatieInstellingenKaarten from './CalculatieInstellingenKaarten'
import OfferteAanmakenModal from '@/components/everts-calc/quotes/OfferteAanmakenModal'
import { usePasInScrollvlak } from '@/lib/hooks/usePasInScrollvlak'
import ControlePaneel from './ControlePaneel'
import { useCalculatieControle } from './useCalculatieControle'
import { useUitvraagInCalculatie } from './uitvraag/useUitvraagInCalculatie'
import { UitvraagProvider } from './uitvraag/UitvraagContext'
import { wisselBevestiging, type ControleSoort } from '@/lib/everts-calc/controle'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { formatGetal } from '@/lib/everts-calc/calculations'
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
import { berekenScenarioKostprijs, berekenScenarioVP, scenarioDefaultOpslag } from '@/lib/everts-calc/calculations'
import { syncCalculatieNaarSupabase, bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { reserveerOfferteNummer } from '@/app/(platform)/everts-calc/actions/quotes'
import { verzamelSyncData, verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import type { Scenario, BibliotheekItemVereenvoudigd, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'
import { metTijdtoeslag } from '@/lib/everts-calc/tijdtoeslag'
import { eigenOpslagen, type EigenOpslag } from '@/lib/everts-calc/calculatie-opslag'

/** Structuurpaneel open of dicht: per browser onthouden, puur een gemak. */
const BOOM_OPEN_SLEUTEL = 'eva.calculatie.structuur-open'

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
  /** Welke calculaties gereviseerd mogen worden:
   *  - `alles`    — elke definitieve calculatie (aanvraag-/offertefase);
   *  - `meerwerk` — alléén meerwerk-calculaties. In de Opdracht-fase is de
   *    contractcalculatie waarvoor opdracht is gegeven vergrendeld (Bouw7 is
   *    daar leidend), maar meerwerk mag nog wel een nieuwe versie krijgen;
   *  - `geen`     — reviseren volledig uit. */
  magReviseren?: 'alles' | 'meerwerk' | 'geen'
  /** Terugknop vooraan in de werkbalk, naar het overzicht waar de calculatie uit geopend is. */
  terug?: { label: string; onClick: () => void }
}

export default function CalculatieHoofdscherm({
  projectId, projectNaam, projectNummer,
  bibliotheekItems = [], readOnly: readOnlyProp = false, scenarioId, dossierContext,
  onScenariosGewijzigd, magReviseren = 'alles', terug,
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Terug naar precies deze weergave. Het pad alleen is niet genoeg: in een gebundelde tab
  // (servicedesk "Opname & offerte") kiest `?deel=` het onderdeel, en zonder die parameter
  // landt de nieuwe offerte op het eerste onderdeel — de opname. Een oude `offerte` gaat eruit;
  // de modal zet de nieuwe erbij.
  const terugNaarUrl = (() => {
    const q = new URLSearchParams(searchParams?.toString() ?? '')
    q.delete('offerte')
    const s = q.toString()
    return s ? `${pathname}?${s}` : pathname
  })()
  const [scenario, setScenario]                       = useState<Scenario | null>(null)
  // Een verzonden (definitieve) calculatie is bevroren: read-only, ook als het
  // dossier zelf bewerkbaar is. Zo kan een verzonden versie nooit wijzigen.
  const readOnly = readOnlyProp || !!scenario?.bevroren_op
  // Meerwerk-calculaties mogen ook in de Opdracht-fase nog gereviseerd worden; de
  // contractcalculatie waarvoor opdracht is gegeven niet.
  const magDezeReviseren =
    magReviseren === 'alles' ||
    (magReviseren === 'meerwerk' && !!scenario?.meerwerk_regel_id)
  const [actiefGroepId, setActiefGroepId]             = useState<string | null>(null)
  const [refreshTotalen, setRefreshTotalen]           = useState(0)
  const [eigenOpslag, setEigenOpslag]                 = useState<EigenOpslag>({ aantal: 0, percentages: [] })
  const [kostprijs, setKostprijs]                     = useState(0)
  const [verkoopprijs, setVerkoopprijs]               = useState(0)
  const [regelsVoorBtw, setRegelsVoorBtw]             = useState<Calculatieregel[]>([])
  const [componentenVoorBtw, setComponentenVoorBtw]   = useState<Componentregel[]>([])
  const [boomUitgeklapt, setBoomUitgeklapt]           = useState(false)
  const [syncStatus, setSyncStatus]                   = useState<SyncStatus>('idle')
  const [opgeslagenOp, setOpgeslagenOp]               = useState<Date | null>(null)
  const [undoCount, setUndoCount]                     = useState(0)
  /** Zijn de diepste groepen allemaal ingeklapt? Bepaalt of de knop in- of uitklapt. */
  /** Menu Tonen: wat het rekenblad laat zien, voor de hele calculatie. */
  const [weergave, setWeergave]                       = useState<Weergave>('regels')
  const [receptenOpen, setReceptenOpen]               = useState(false)
  const [schilderwerkOpen, setSchilderwerkOpen]       = useState(false)
  const [materialenOpen, setMaterialenOpen]           = useState(false)
  const [toonCufImport, setToonCufImport]             = useState(false)
  const [offerteModalOpen, setOfferteModalOpen]       = useState(false)
  const [offerteModalType, setOfferteModalType]       = useState<QuoteType>('verkoopofferte')
  const [instellingenOpen, setInstellingenOpen]       = useState(false)
  const [controleOpen, setControleOpen]               = useState(false)
  /** Venster uit het menu Bewerken. */
  const [bewerkVenster, setBewerkVenster]             = useState<'behandeling' | 'uren' | null>(null)
  const gridRef       = useRef<CalculatieGridHandle>(null)
  const [schermRef, schermHoogte] = usePasInScrollvlak()

  /* ── Structuur: open/dicht, per gebruiker onthouden ─────────────── */
  useEffect(() => {
    try { if (localStorage.getItem(BOOM_OPEN_SLEUTEL) === '1') setBoomUitgeklapt(true) } catch { /* geen opslag */ }
  }, [])

  const handleToggleBoom = useCallback(() => {
    setBoomUitgeklapt(open => {
      try { localStorage.setItem(BOOM_OPEN_SLEUTEL, open ? '0' : '1') } catch { /* geen opslag */ }
      return !open
    })
  }, [])

  const handleWeergave = useCallback((w: Weergave) => { setWeergave(w); gridRef.current?.zetWeergave(w) }, [])
  // Klapt iemand losse groepen in of uit, dan klopt "Alleen groepen" niet meer (of juist wel).
  const handleInklapStatus = useCallback((allesDicht: boolean) => {
    setWeergave(w => (allesDicht ? 'groepen' : w === 'groepen' ? 'regels' : w))
  }, [])
  const handleUndo         = useCallback(() => gridRef.current?.undo(), [])

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
    setVerkoopprijs(berekenScenarioVP(gs, rs, cs, scenarioDefaultOpslag(scenario)))
    setRegelsVoorBtw(rs)
    // Met de tijdtoeslag in de arbeidsnormen: de btw-uitsplitsing in de totalenbalk
    // telt zo dezelfde verkoopprijs als hierboven.
    setComponentenVoorBtw(metTijdtoeslag(cs, rs, gs))
    setEigenOpslag(eigenOpslagen(rs, cs))
  }, [refreshTotalen, scenario])

  /* ── Controle vóór de offerte ────────────────────────────────────── */
  const controle = useCalculatieControle({
    scenario, regels: regelsVoorBtw, componenten: componentenVoorBtw, kostprijs, verkoopprijs, versie: refreshTotalen,
  })
  const uitvraag = useUitvraagInCalculatie({ dossierId: dossierContext?.dossierId, scenarioId: scenario?.id, readOnly })
  const uurtarieven = useInstellingen().uurtarieven ?? []
  const globaalTarief = (uurtarieven.find(t => t.is_favoriet) ?? uurtarieven[0])?.tarief ?? 0

  // Een calculatie begint altijd met het ★-tarief uit Stamgegevens. Calculaties die
  // zonder tarief zijn begonnen (de instellingen waren toen nog niet geladen, of lazen
  // een lege lijst) krijgen het bij openen alsnog. Alleen het veld: bestaande regels
  // houden hun tarief. Niet bij een bevroren of alleen-lezen calculatie.
  useEffect(() => {
    if (!scenario || readOnly || scenario.standaard_uurtarief || globaalTarief <= 0) return
    handleScenarioWijzig({ standaard_uurtarief: globaalTarief })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id, globaalTarief, readOnly])

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
        setOpgeslagenOp(new Date())
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

  /**
   * Wijziging vanuit de structuurboom (verplaatsen, toevoegen, verwijderen). Het
   * rekenblad leest zijn gegevens alleen bij het openen, dus moet het hier expliciet
   * opnieuw inlezen — anders zie je het resultaat pas na een verversing.
   *
   * Bewust niet in `handleWijziging` zelf: die vuurt ook bij elke bewerking ín het
   * rekenblad, en een herlaad midden in het typen zou de invoer onderbreken.
   */
  const handleBoomWijziging = () => {
    handleWijziging()
    gridRef.current?.herlaad()
  }

  const handleScenarioWijzig = (patch: Partial<Scenario>) => {
    // Basis uit het werkgeheugen, niet de React-kopie: het venster "Voorwaarden, tekst &
    // bijlages" schrijft daar rechtstreeks in, en een verouderde kopie zou die keuzes
    // bij de volgende wijziging (opslag, uurtarief) weer overschrijven.
    const bijgewerkt = { ...(getScenario(scenario.id) ?? scenario), ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
    planAutoSave()
  }

  /** Opslagveld in de totalenbalk: zet de standaard-opslag van de calculatie en haalt
   *  de eigen percentages van alle regels weg, zodat ze die standaard volgen. Daarna
   *  kan elke regel weer een afwijkend percentage krijgen. Ctrl+Z zet de regels terug;
   *  de waarde in de balk blijft staan en typ je desgewenst opnieuw. */
  /** Opslagveld in de totalenbalk: zet de opslag van de calculatie. Regels met een eigen
   *  opslag% blijven staan, tenzij de calculator kiest voor "alle regels". */
  const handleOpslagToepassen = (pct: number, ookEigen: boolean) => {
    if (readOnly) return
    gridRef.current?.duwSnapshot()
    handleScenarioWijzig({ opslag_pct: pct })
    if (ookEigen) gridRef.current?.wisRegelOpslagen()
    handleWijziging()
  }

  /** Uurtariefveld in de totalenbalk: zet het tarief van de calculatie. De arbeidsregels
   *  die het oude tarief volgden gaan mee; een eigen tarief per regel (bijv. een uitvoerder
   *  met een ander uurloon) blijft staan, en Controle laat die regels nakijken. Ctrl+Z zet
   *  de regels terug; de waarde in de balk blijft staan. */
  const handleUurtariefToepassen = (tarief: number) => {
    if (readOnly) return
    const oud = scenario.standaard_uurtarief || globaalTarief
    gridRef.current?.duwSnapshot()
    handleScenarioWijzig({ standaard_uurtarief: tarief })
    gridRef.current?.zetArbeidTarieven(tarief, oud)
    handleWijziging()
  }

  /** Start het offertevenster (Controle › Voorwaarden, tekst & bijlages › Lay-out).
   *  Eerst een openstaande wijziging wegschrijven: het venster rekent met wat er in
   *  het werkgeheugen staat en bewaart zijn keuzes via de gedeelde snapshot. */
  const startOfferte = async (type: QuoteType) => {
    if (dirtyRef.current) await saveRef.current(true)
    setOfferteModalType(type)
    setOfferteModalOpen(true)
  }

  /** Het venster "Voorwaarden, tekst & bijlages" schrijft in het werkgeheugen; daarna de
   *  React-kopie bijwerken, zodat de controle de nieuwe keuze ziet. */
  const verversScenario = () => setScenario(s => (s && getScenario(s.id)) ?? s)

  const handleKlopt = (sleutel: string) => {
    if (readOnly) return
    handleScenarioWijzig({ controle_bevestigd: wisselBevestiging(getScenario(scenario.id)?.controle_bevestigd, sleutel) })
  }

  const handleNaarRegel = (regelId: string) => {
    setOfferteModalOpen(false)
    setControleOpen(true)
    gridRef.current?.toonRegel(regelId)
  }

  const tariefVoorFix = scenario.standaard_uurtarief || globaalTarief
  const controleActies: Partial<Record<ControleSoort, { label: string; onClick: () => void }>> = {
    arbeid_zonder_tarief: tariefVoorFix > 0
      ? { label: `€ ${formatGetal(tariefVoorFix, 2)} per uur toepassen op alle uren`, onClick: () => handleUurtariefToepassen(tariefVoorFix) }
      // Nog geen tarief bekend: het veld onderin aanwijzen in plaats van een bedrag te raden.
      : { label: 'Uurtarief invullen', onClick: () => { setOfferteModalOpen(false); document.getElementById('calc-uurtarief')?.focus() } },
    geen_voorwaarden: { label: 'Kiezen', onClick: () => setInstellingenOpen(true) },
  }

  /** Reviseren: maakt een nieuwe, bewerkbare versie van deze (definitieve)
   *  calculatie en opent die. De offerte maak je daarna opnieuw. */
  const handleReviseer = async () => {
    if (!scenario) return
    const nieuw = await reviseerCalculatie(projectId, scenario.id)
    if (!nieuw) { toast.error('Reviseren mislukt'); return }
    // Zet het gekoppelde dossier terug naar Aanvraag · Nieuw (aanvraag-fase, of een
    // EVA-gedreven offerte zonder Bouw7-koppeling). Fail-soft: revisie is al gelukt.
    // Meerwerk staat los van de contractketen: een nieuwe meerwerkversie mag de
    // dossierstatus nooit terugzetten.
    if (dossierContext && !scenario.meerwerk_regel_id) {
      try {
        const res = await resetDossierNaarAanvraagBijRevisie(projectId)
        if (res.ok && res.gewijzigd) toast.success('Dossier teruggezet naar Aanvraag · Nieuw')
      } catch { /* niet blokkerend */ }
    }
    toast.success('Nieuwe versie aangemaakt')
    onScenariosGewijzigd?.(nieuw.id)
  }

  /** Kopiëren: een concept-calculatie (nog niet verzonden) als nieuwe versie
   *  dupliceren, bijv. om een variant uit te werken. Geen dossier-reset: er is nog
   *  niets verzonden. */
  const handleKopieer = async () => {
    if (!scenario) return
    const nieuw = await reviseerCalculatie(projectId, scenario.id)
    if (!nieuw) { toast.error('Kopiëren mislukt'); return }
    toast.success(`Kopie aangemaakt als v${nieuw.versie}`)
    onScenariosGewijzigd?.(nieuw.id)
  }

  return (
    <div ref={schermRef} className="flex flex-col h-[calc(100dvh-56px)] bg-slate-50" style={schermHoogte ? { height: schermHoogte } : undefined}>

      {/* ─── Bevroren banner ── */}
      {readOnly && (
        <Alert tone="warning" title="Calculatie bevroren" className="rounded-none border-x-0 border-t-0 flex-shrink-0">
          {scenario?.bevroren_op
            ? 'De offerte van deze versie is verzonden (definitief). De calculatie is alleen-lezen — reviseer om een nieuwe versie te maken.'
            : 'De calculatie is alleen-lezen.'}
        </Alert>
      )}

      {/* ─── Werkbalk ── */}
      <CalculatieWerkbalk
        readOnly={readOnly}
        terug={terug}
        boomOpen={boomUitgeklapt}
        onToggleBoom={handleToggleBoom}
        undoCount={undoCount}
        onUndo={handleUndo}
        syncStatus={syncStatus}
        opgeslagenOp={opgeslagenOp}
        onOpslaan={() => slaCalculatieOp(false)}
        onBibliotheek={soort => (soort === 'recepten' ? setReceptenOpen : soort === 'schilderwerk' ? setSchilderwerkOpen : setMaterialenOpen)(true)}
        meetstaat={
          <MeetstaatKnop projectId={projectId} scenarioId={scenario.id} projectNaam={projectNaam} projectNummer={projectNummer}
            terugUrl={terugNaarUrl} isVuil={() => dirtyRef.current}
            bewaarEerst={async () => { if (dirtyRef.current) await saveRef.current(true) }}
            onNaMeetstaat={() => { setScenario(s => (s && getScenario(s.id)) ?? s); handleBoomWijziging() }} />
        }
        onBehandelingPerCode={() => setBewerkVenster('behandeling')}
        onUrenPerGroep={() => setBewerkVenster('uren')}
        weergave={weergave}
        onWeergave={handleWeergave}
        // Meerwerk niet kopiëren: een tweede scenario bij dezelfde meerwerkregel zou de
        // actuele meerwerk-calculatie stil vervangen (hoogste versie wint).
        kanKopieren={!readOnly && magReviseren === 'alles' && !scenario.meerwerk_regel_id}
        onKopieer={handleKopieer}
        kanReviseren={!!scenario.bevroren_op && magDezeReviseren}
        onReviseer={handleReviseer}
        onImporteer={() => setToonCufImport(true)}
        onCufExport={handleCufExport}
        onExcelExport={handleExcelExport}
        kanOfferte={!!dossierContext && !readOnly}
        controle={{ ...controle.tellers, open: controleOpen, onToggle: () => setControleOpen(o => !o) }}
        onStartOfferte={startOfferte}
        onInstellingen={() => setInstellingenOpen(true)}
        uitvraagKnop={uitvraag.knop}
      />

      {/* ─── Boom + Grid ── */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* Structuur: naast het grid, op klik. Blijft open tot je hem sluit, zodat je kunt
            navigeren en slepen terwijl je rekent. Dicht = verborgen, niet ontkoppeld: de boom
            houdt zo zijn uitgeklapte groepen. */}
        <aside className={`${boomUitgeklapt ? 'flex' : 'hidden'} w-80 xl:w-[26rem] flex-shrink-0 flex-col bg-white border-r border-slate-200`}>
          <div className="flex-1 overflow-hidden">
            <StructuurBoom
              scenarioId={scenario.id}
              actiefGroepId={actiefGroepId}
              refreshTrigger={refreshTotalen}
              onSelecteer={setActiefGroepId}
              onWijziging={handleBoomWijziging}
              onVoorWijziging={() => gridRef.current?.duwSnapshot()}
              readOnly={readOnly}
              onSluit={handleToggleBoom}
            />
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <UitvraagProvider value={uitvraag.context}><CalculatieGrid
            ref={gridRef}
            scenarioId={scenario.id}
            scenario={scenario}
            actiefGroepId={actiefGroepId}
            onGroepActief={setActiefGroepId}
            onWijziging={handleWijziging}
            onTekstWijziging={planAutoSave}
            onUndoCountChange={setUndoCount}
            onInklapStatusChange={handleInklapStatus}
            bibliotheekItems={bibliotheekItems}
            readOnly={readOnly}
          /></UitvraagProvider>
        </div>

        <ControlePaneel
          open={controleOpen} onSluit={() => setControleOpen(false)}
          punten={controle.punten} tellers={controle.tellers} readOnly={readOnly}
          onNaarRegel={handleNaarRegel} onKlopt={handleKlopt} acties={controleActies}
        />
        {uitvraag.paneel}

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
        onOpslagToepassen={handleOpslagToepassen}
        onUurtariefToepassen={handleUurtariefToepassen}
        eigenOpslag={eigenOpslag}
        readOnly={readOnly}
      />

      {bewerkVenster === 'behandeling' && (
        <BehandelingPerCodeDialoog scenarioId={scenario.id} readOnly={readOnly} onSluit={() => setBewerkVenster(null)}
          onVoorWijziging={() => gridRef.current?.duwSnapshot()} onNaWijziging={handleBoomWijziging} />
      )}
      {bewerkVenster === 'uren' && (
        <UrenPerGroepDialoog scenarioId={scenario.id} readOnly={readOnly} onSluit={() => setBewerkVenster(null)}
          onVoorWijziging={() => gridRef.current?.duwSnapshot()} onNaWijziging={handleBoomWijziging} />
      )}

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
          onClose={() => { setOfferteModalOpen(false); verversScenario() }}
          projectId={projectId}
          scenarioId={scenario.id}
          dossierId={dossierContext.dossierId}
          projectNaam={projectNaam}
          clientNaam={dossierContext.clientNaam ?? ''}
          projectNummer={projectNummer}
          type={offerteModalType}
          meerwerkRegelId={scenario.meerwerk_regel_id ?? null}
          terugNaarUrl={terugNaarUrl}
          vanServerLaden={false}
          totaalExcl={verkoopprijs}
          controle={{
            punten: controle.puntenVoorOfferte,
            acties: controleActies,
            onKlopt: handleKlopt,
            onNaarRegel: handleNaarRegel,
          }}
        />
      )}

      {/* Betalingscondities & Algemene voorwaarden — per calculatie/offerte (scenario). */}
      <Dialog
        open={instellingenOpen}
        onOpenChange={(o) => {
          setInstellingenOpen(o)
          if (!o) verversScenario()
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Voorwaarden, tekst &amp; bijlages</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-slate-500 mb-3">
              Deze keuze geldt voor deze calculatie en wordt overgenomen op offertes die je hiervan aanmaakt.
            </p>
            <CalculatieInstellingenKaarten
              projectId={projectId}
              dossierId={dossierContext?.dossierId}
              scenarioId={scenario.id}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
