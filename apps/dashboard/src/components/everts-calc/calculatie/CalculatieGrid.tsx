'use client'

import { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ChevronDown, Move, CopyPlus, X, Percent, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDialogen } from '@/components/ui/dialogen'
import { getGroepen, getCalculatieregels, getComponentregels, slaGroepOp, slaCalculatieregelOp, slaComponentregelOp, upsertComponentregel, verwijderGroep, verwijderCalculatieregel, verwijderComponentregel, voegComponentregelToe, getMeetregelAggregaten, slaMeetregelAggregaatOp, herstelSnapshot } from '@/lib/everts-calc/local-store'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { berekenGroepUren, berekenGroepMaterieel, berekenGroepOA, berekenScenarioKostprijs, berekenScenarioVP, berekeningNummers, formatEuro, formatGetal, parseGetal, scenarioDefaultOpslag } from '@/lib/everts-calc/calculations'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Groep, Calculatieregel, Componentregel, Scenario } from '@/lib/everts-calc/types'
import { laadBehandelingen } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import { tariefKort, vindTarief, type BtwTariefKeuze } from '@/lib/stamdata/btw'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import { haalHuidigeGebruikerId } from '@/app/(platform)/everts-calc/actions/layouts-calc'
import { laadLayouts, slaLayoutOp, verwijderLayout, stelStandaardIn } from '@/app/actions/layouts'
import { useBewaarLaatsteKolommen, LAATST_SCHERM } from './kolom-geheugen'
import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'
import type { KolomConfig, GebruikerLayout } from '@everts/database/platform-types'
import { type ColId, COL_DEFS, TEKSTVELDEN, COL_MAP, DEFAULT_ORDER, DEFAULT_WIDTHS, LAYOUT_SCHERM, NAMEN_SCHERM, stateNaarLayout, layoutNaarState } from './grid/kolommen'
import { TabelHeader, KolomNaamVeld } from './grid/TabelHeader'
import { kiesBtwTarief } from './grid/btw-keuze'
import { GroepSectie } from './grid/GroepSectie'
import type { RegelActie } from './grid/ActieMenu'

interface Props {
  scenarioId: string
  scenario: Scenario
  actiefGroepId: string | null
  onGroepActief: (id: string) => void
  onWijziging: () => void
  /**
   * Alleen tekst gewijzigd (omschrijving e.d.): wel opslaan, géén totalen herrekenen. Elke
   * toetsaanslag zette anders 3–4 renders in gang (totalen, btw-balk, structuurboom); bij snel
   * typen in een grote calculatie liep de React-updateteller vol (#185). Zonder deze prop
   * valt hij terug op `onWijziging`.
   */
  onTekstWijziging?: () => void
  onUndoCountChange?: (count: number) => void
  /** Meldt of de diepste groepen allemaal ingeklapt zijn — voedt het label van de in-/uitklapknop. */
  onInklapStatusChange?: (allesIngeklapt: boolean) => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Alleen-lezen (bevroren calculatie): inhoud is te bekijken en in/uit te klappen,
   *  maar niets is bewerkbaar. */
  readOnly?: boolean
}

export interface CalculatieGridHandle {
  undo: () => void
  /** true = de diepste groepen inklappen (elke groepskop blijft zichtbaar, regels verdwijnen);
   *  false = alles uitklappen. */
  zetInklap: (ingeklapt: boolean) => void
  /** Zet een herstelpunt vóór een wijziging van buitenaf (structuurboom), zodat Ctrl+Z die terugdraait. */
  duwSnapshot: () => void
  /**
   * Leest groepen, regels en componenten opnieuw in. Nodig na een wijziging van buitenaf:
   * het grid laadt zijn gegevens verder alleen bij het openen, dus zonder dit blijft een
   * verplaatsing uit de structuurboom onzichtbaar tot je de pagina ververst.
   */
  herlaad: () => void
  /**
   * Wist het eigen opslag% van álle regels en componenten, zodat ze weer de
   * standaard-opslag van de calculatie volgen. Gebruikt door het opslagveld in de
   * totalenbalk. Daarna kan elke regel gewoon weer een eigen percentage krijgen.
   */
  wisRegelOpslagen: () => void
  /**
   * Zet het uurtarief van álle arbeidsregels in deze calculatie. Gebruikt door het
   * uurtariefveld in de totalenbalk: dat veld is het tarief van de calculatie, dus
   * een wijziging hoort overal door te werken en niet alleen op nieuwe regels.
   */
  zetArbeidTarieven: (tarief: number) => void
  /** Springt naar een regel: klapt de groepen erboven open, selecteert hem en scrolt
   *  hem in beeld. Gebruikt door de controle ("Naar regel"). */
  toonRegel: (regelId: string) => void
}

type Snapshot = { groepen: Groep[]; regels: Calculatieregel[]; componenten: Componentregel[] }


// ─── Hoofd CalculatieGrid ─────────────────────────────────────────────────────

const CalculatieGrid = forwardRef<CalculatieGridHandle, Props>(function CalculatieGrid(
  { scenarioId, scenario, actiefGroepId, onGroepActief, onWijziging, onTekstWijziging, onUndoCountChange, onInklapStatusChange, bibliotheekItems = [], readOnly = false },
  ref
) {
  const [groepen,     setGroepen]     = useState<Groep[]>([])
  const [regels,      setRegels]      = useState<Calculatieregel[]>([])
  const [componenten, setComponenten] = useState<Componentregel[]>([])
  const [nummers,     setNummers]     = useState<Map<string, string>>(new Map())
  const [nieuwGroepParent,    setNieuwGroepParent]    = useState<Groep | null>(null)
  const [nieuwGroepNaam,      setNieuwGroepNaam]      = useState('')
  const [nieuwRootGroepOpen,  setNieuwRootGroepOpen]  = useState(false)
  const [nieuwRootGroepNaam,  setNieuwRootGroepNaam]  = useState('')

  // Collapse-signaal voor componentregels
  const [collapseSignal, setCollapseSignal] = useState(0)

  // Selectie
  const [geselecteerdeRegels, setGeselecteerdeRegels] = useState<Set<string>>(new Set())

  // Move-to-group modal
  const [verplaatsModalOpen, setVerplaatsModalOpen] = useState(false)

  // Bulk-wijziging opslag% / BTW van de selectie
  const [opslagModalOpen, setOpslagModalOpen] = useState(false)
  const [opslagInvoer,    setOpslagInvoer]    = useState('')
  const [btwModalOpen,    setBtwModalOpen]    = useState(false)

  // Undo history
  const historyRef = useRef<Snapshot[]>([])

  // Intern klembord (Ctrl+C / Ctrl+X / Ctrl+V)
  const klembordRegels     = useRef<Calculatieregel[]>([])
  const klembordComponenten = useRef<Componentregel[]>([])

  // Regels slepen (binnen en tussen groepen). Groepen zelf herorden je in de
  // structuurboom: daar is elke rij een groep, dus zijn de doelen groot en eenduidig.
  const [sleepRegelId,  setSleepRegelId]  = useState<string | null>(null)
  /** Regels die met de huidige sleep meegaan: de hele selectie als je een
   *  geselecteerde regel oppakt, anders alleen die ene regel. */
  const [sleepRegelIds, setSleepRegelIds] = useState<Set<string>>(new Set())
  const [dragOverId,    setDragOverId]    = useState<string | null>(null)

  // Instellingen — geabonneerd, zodat de lijst uit Supabase ook doorkomt als de
  // hydratie pas ná de eerste render binnen is (dossiertab opent sneller dan de fetch).
  const _inst        = useInstellingen()
  const kolomNamen   = (_inst.kolom_namen ?? {}) as Record<string, string>
  const uurtarieven  = _inst.uurtarieven ?? []
  const eenheden     = _inst.eenheden ?? []

  // BTW-tarieven komen uit de stamgegevens (afgeleid uit Bouw7), niet uit de calc-instellingen:
  // zo staan de tarieven in de calculatie gelijk aan die in de offerte en in Bouw7.
  const [btwTarieven, setBtwTarieven] = useState<BtwTariefKeuze[]>([])
  useEffect(() => {
    laadBtwTarieven().then(setBtwTarieven).catch(() => setBtwTarieven([]))
  }, [])

  // Schilderbehandelingen: één keer voor het hele grid, zodat elke regel de naam
  // van zijn gekoppelde behandeling live kan tonen zonder eigen fetch per rij.
  const [behandelingen, setBehandelingen] = useState<SchilderBehandeling[]>([])
  useEffect(() => {
    laadBehandelingen().then(setBehandelingen).catch(() => setBehandelingen([]))
  }, [])

  // Kolom breedte + volgorde
  const [colWidths, setColWidths] = useState<Record<ColId, number>>(DEFAULT_WIDTHS)
  const [colOrder,  setColOrder]  = useState<ColId[]>(DEFAULT_ORDER)
  const [dragCol,     setDragCol]     = useState<ColId | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColId | null>(null)
  const resizeRef = useRef<{ col: ColId; startX: number; startW: number } | null>(null)
  const tabelRef  = useRef<HTMLTableElement>(null)
  const NON_HIDEABLE: ColId[] = ['omschrijving', 'acties']
  // Verborgen kolommen horen bij de kolom-layout (per gebruiker in de database,
  // zie gebruiker_layouts hieronder) en niet apart op dit apparaat: anders zag je
  // op je tweede scherm een andere kolomindeling dan op je eerste.
  const [hiddenCols, setHiddenCols] = useState<Set<ColId>>(new Set())
  const toggleHiddenCol = (id: ColId) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  // Kolom-layouts + kolommen-picker worden via een portal in de actiebalk getoond
  // (naast "Opties"); de slot leeft in CalculatieHoofdscherm.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setToolbarSlot(document.getElementById('calc-grid-toolbar-slot')) }, [])

  // Kolom-layouts per gebruiker (gebruiker_layouts)
  const [userId, setUserId]               = useState<string | null>(null)
  const [layouts, setLayouts]             = useState<GebruikerLayout[]>([])
  const [actiefLayoutId, setActiefLayoutId] = useState<string | null>(null)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const layoutMenuRef = useRef<HTMLDivElement>(null)
  const { vraagTekst } = useDialogen()

  // Eigen kolomnamen van deze gebruiker (leeg = de naam uit de instellingen/standaard)
  const [colNamen,      setColNamen]      = useState<Partial<Record<ColId, string>>>({})
  const [namenRijId,    setNamenRijId]    = useState<string | null>(null)

  const [laatstRijId, setLaatstRijId] = useState<string | null>(null)
  const [kolomGeheugenKlaar, setKolomGeheugenKlaar] = useState(false)
  useBewaarLaatsteKolommen({
    userId, rijId: laatstRijId, onRijId: setLaatstRijId, actiefLayoutId, klaar: kolomGeheugenKlaar,
    kolommen: stateNaarLayout(colOrder, hiddenCols, colWidths),
  })

  const pasLayoutToe = useCallback((cfg: KolomConfig[], layoutId: string | null) => {
    const { colOrder: o, hiddenCols: h, colWidths: w } = layoutNaarState(cfg)
    setColOrder(o); setHiddenCols(h); setColWidths(w); setActiefLayoutId(layoutId)
  }, [])

  // Layouts + eigen kolomnamen laden bij mount; standaard-layout toepassen indien aanwezig
  useEffect(() => {
    let afgebroken = false
    ;(async () => {
      const id = await haalHuidigeGebruikerId()
      if (afgebroken || !id) return
      setUserId(id)
      const [rijen, namenRijen, laatstRijen] = await Promise.all([
        laadLayouts(id, LAYOUT_SCHERM),
        laadLayouts(id, NAMEN_SCHERM),
        laadLayouts(id, LAATST_SCHERM),
      ])
      if (afgebroken) return
      setLayouts(rijen)
      // De laatst gebruikte indeling wint van de standaard-layout (zie kolom-geheugen.ts).
      const laatst = laatstRijen[0]
      const standaard = rijen.find(l => l.is_standaard)
      if (laatst) {
        setLaatstRijId(laatst.id)
        pasLayoutToe(laatst.kolommen, rijen.some(l => l.id === laatst.naam) ? laatst.naam : null)
      } else if (standaard) pasLayoutToe(standaard.kolommen, standaard.id)
      setKolomGeheugenKlaar(true)

      const namenRij = namenRijen[0]
      if (namenRij) {
        setNamenRijId(namenRij.id)
        const namen: Partial<Record<ColId, string>> = {}
        for (const c of namenRij.kolommen) {
          if (c.naam && (c.key as ColId) in COL_MAP) namen[c.key as ColId] = c.naam
        }
        setColNamen(namen)
      }
    })()
    return () => { afgebroken = true }
  }, [pasLayoutToe])

  const herlaadLayouts = useCallback(async () => {
    if (!userId) return
    setLayouts(await laadLayouts(userId, LAYOUT_SCHERM))
  }, [userId])

  /** Naam die je in de kop ziet: eigen naam > naam uit de instellingen > standaard. */
  const standaardKolomNaam = useCallback(
    (id: ColId) => kolomNamen[id] ?? COL_MAP[id].label,
    [kolomNamen],
  )
  const effectieveKolomNamen = useMemo(() => {
    const uit: Record<string, string> = {}
    for (const c of COL_DEFS) uit[c.id] = colNamen[c.id] ?? kolomNamen[c.id] ?? c.label
    return uit
  }, [colNamen, kolomNamen])

  const bewaarKolomNamen = useCallback(async (namen: Partial<Record<ColId, string>>) => {
    if (!userId) return
    const cfg: KolomConfig[] = Object.entries(namen)
      .map(([key, naam], i) => ({ key, zichtbaar: true, volgorde: i, naam: naam as string }))
    const res = await slaLayoutOp(userId, NAMEN_SCHERM, 'kolomnamen', cfg, namenRijId ?? undefined)
    if (!res.ok) { toast.error(res.error); return }
    if (!namenRijId && res.id) setNamenRijId(res.id)
  }, [userId, namenRijId])

  /** Kolom hernoemen. Leeg of gelijk aan de standaardnaam = terug naar standaard. */
  const zetKolomNaam = useCallback((id: ColId, naam: string) => {
    const schoon = naam.trim()
    const volgende = { ...colNamen }
    if (!schoon || schoon === standaardKolomNaam(id)) delete volgende[id]
    else volgende[id] = schoon
    setColNamen(volgende)
    void bewaarKolomNamen(volgende)
  }, [colNamen, standaardKolomNaam, bewaarKolomNamen])

  const layoutOpslaanAlsNieuw = useCallback(async () => {
    if (!userId) return
    const naam = (await vraagTekst({
      titel: 'Nieuwe kolom-layout',
      label: 'Naam',
      placeholder: 'Bijvoorbeeld: Calculatie compact',
      verplicht: true,
      bevestigLabel: 'Opslaan',
    }))?.trim()
    if (!naam) return
    if (layouts.some(l => l.naam.toLowerCase() === naam.toLowerCase())) {
      toast.error('Er bestaat al een layout met deze naam'); return
    }
    const res = await slaLayoutOp(userId, LAYOUT_SCHERM, naam, stateNaarLayout(colOrder, hiddenCols, colWidths))
    if (!res.ok) { toast.error(res.error); return }
    setActiefLayoutId(res.id ?? null)
    await herlaadLayouts()
    toast.success(`Layout "${naam}" opgeslagen`)
    setLayoutMenuOpen(false)
  }, [userId, layouts, colOrder, hiddenCols, colWidths, herlaadLayouts, vraagTekst])

  const layoutBijwerken = useCallback(async () => {
    if (!userId || !actiefLayoutId) return
    const huidig = layouts.find(l => l.id === actiefLayoutId)
    if (!huidig) return
    const res = await slaLayoutOp(userId, LAYOUT_SCHERM, huidig.naam, stateNaarLayout(colOrder, hiddenCols, colWidths), actiefLayoutId)
    if (!res.ok) { toast.error(res.error); return }
    await herlaadLayouts()
    toast.success(`Layout "${huidig.naam}" bijgewerkt`)
    setLayoutMenuOpen(false)
  }, [userId, actiefLayoutId, layouts, colOrder, hiddenCols, colWidths, herlaadLayouts])

  const layoutVerwijderen = useCallback(async (id: string) => {
    if (!userId) return
    const res = await verwijderLayout(id, userId)
    if (!res.ok) { toast.error(res.error); return }
    if (actiefLayoutId === id) {
      setActiefLayoutId(null)
      setColOrder(DEFAULT_ORDER); setColWidths(DEFAULT_WIDTHS); setHiddenCols(new Set())
    }
    await herlaadLayouts()
    toast.success('Layout verwijderd')
  }, [userId, actiefLayoutId, herlaadLayouts])

  const layoutStandaardZetten = useCallback(async (id: string) => {
    if (!userId) return
    const res = await stelStandaardIn(id, userId, LAYOUT_SCHERM)
    if (!res.ok) { toast.error(res.error); return }
    await herlaadLayouts()
    toast.success('Standaard-layout ingesteld')
  }, [userId, herlaadLayouts])

  // Layout-menu klik-buiten sluiten
  useEffect(() => {
    if (!layoutMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node))
        setLayoutMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [layoutMenuOpen])

  const defaultOpslag = scenarioDefaultOpslag(scenario)

  const laadAlles = useCallback(() => {
    const gs = getGroepen(scenarioId).sort((a, b) => a.volgorde - b.volgorde)
    const groepIds  = new Set(gs.map(g => g.id))
    const rs        = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds  = new Set(rs.map(r => r.id))
    const cs        = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
    setGroepen(gs); setRegels(rs); setComponenten(cs)
    setNummers(berekeningNummers(gs))
  }, [scenarioId])

  useEffect(() => { laadAlles() }, [laadAlles])

  // ─── Kolom picker klik-buiten sluiten ─────────────────────────────────────
  useEffect(() => {
    if (!colPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setColPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colPickerOpen])

  // ─── Undo ──────────────────────────────────────────────────────────────────
  const duwSnapshot = useCallback(() => {
    const snap: Snapshot = {
      groepen:    [...groepen],
      regels:     [...regels],
      componenten:[...componenten],
    }
    historyRef.current = [snap, ...historyRef.current].slice(0, 20)
    onUndoCountChange?.(historyRef.current.length)
  }, [groepen, regels, componenten, onUndoCountChange])

  const undo = useCallback(() => {
    const snap = historyRef.current.shift()
    if (!snap) return
    herstelSnapshot(scenarioId, snap.groepen, snap.regels, snap.componenten)
    setGroepen(snap.groepen)
    setRegels(snap.regels)
    setComponenten(snap.componenten)
    setNummers(berekeningNummers(snap.groepen))
    onUndoCountChange?.(historyRef.current.length)
    onWijziging()
    setGeselecteerdeRegels(new Set())
    toast.success('Ongedaan gemaakt')
  }, [scenarioId, onUndoCountChange, onWijziging])

  /** Groepen die zelf subgroepen hebben. Die blijven bij "inklappen" open staan,
   *  anders verdwijnen hun subgroepen uit beeld. */
  const groepenMetSubgroepen = useMemo(
    () => new Set(groepen.map(g => g.parent_id).filter((id): id is string => !!id)),
    [groepen]
  )

  const zetInklap = useCallback((ingeklapt: boolean) => {
    // Inklappen raakt alleen de diepste groepen: alle groepskoppen blijven zichtbaar,
    // alleen de calculatieregels verdwijnen. Uitklappen opent alles.
    const bijgewerkt = groepen.map(g => ({ ...g, ingeklapt: ingeklapt && !groepenMetSubgroepen.has(g.id) }))
    bijgewerkt.forEach((g, i) => { if ((groepen[i].ingeklapt ?? false) !== g.ingeklapt) slaGroepOp(g) })
    setGroepen(bijgewerkt)
    if (ingeklapt) setCollapseSignal(s => s + 1)
  }, [groepen, groepenMetSubgroepen])

  const handleToggleInklap = useCallback((id: string) => {
    const groep = groepen.find(g => g.id === id)
    if (!groep) return
    const bijgewerkt = { ...groep, ingeklapt: !(groep.ingeklapt ?? false) }
    slaGroepOp(bijgewerkt)
    setGroepen(prev => prev.map(g => g.id === id ? bijgewerkt : g))
  }, [groepen])

  /** Alles ingeklapt = elke diepste groep is dicht. Bepaalt of de knop in- of uitklapt. */
  const allesIngeklapt = useMemo(() => {
    const diepste = groepen.filter(g => !groepenMetSubgroepen.has(g.id))
    return diepste.length > 0 && diepste.every(g => g.ingeklapt)
  }, [groepen, groepenMetSubgroepen])

  useEffect(() => { onInklapStatusChange?.(allesIngeklapt) }, [allesIngeklapt, onInklapStatusChange])

  /** Alle eigen opslagpercentages weg; de regels vallen terug op de calculatie-opslag. */
  const wisRegelOpslagen = useCallback(() => {
    if (readOnly) return
    const nieuweRegels = regels.map(r => {
      if (r.opslag_pct === undefined) return r
      const bijgewerkt = { ...r, opslag_pct: undefined }
      slaCalculatieregelOp(bijgewerkt)
      return bijgewerkt
    })
    const nieuweComponenten = componenten.map(c => {
      if (c.opslag_pct === undefined) return c
      return slaComponentregelOp({ ...c, opslag_pct: undefined })
    })
    setRegels(nieuweRegels)
    setComponenten(nieuweComponenten)
    onWijziging()
  }, [readOnly, regels, componenten, onWijziging])

  /** Alle arbeidscomponenten op één uurtarief zetten (uurtariefveld in de totalenbalk). */
  const zetArbeidTarieven = useCallback((tarief: number) => {
    if (readOnly) return
    const bijgewerkt = componenten.map(c =>
      c.type === 'arbeid' && c.tarief !== tarief ? slaComponentregelOp({ ...c, tarief }) : c
    )
    setComponenten(bijgewerkt)
    onWijziging()
  }, [readOnly, componenten, onWijziging])

  const toonRegel = useCallback((regelId: string) => {
    const regel = regels.find(r => r.id === regelId)
    if (!regel) return
    // De groep van de regel en alle groepen erboven open.
    const open = new Set<string>()
    for (let g = groepen.find(x => x.id === regel.groep_id); g; g = groepen.find(x => x.id === g!.parent_id)) open.add(g.id)
    const bijgewerkt = groepen.map(g => (open.has(g.id) && g.ingeklapt ? { ...g, ingeklapt: false } : g))
    bijgewerkt.forEach((g, i) => { if (g !== groepen[i]) slaGroepOp(g) })
    setGroepen(bijgewerkt)
    setGeselecteerdeRegels(new Set([regelId]))
    // Na de render staat de rij in de DOM.
    setTimeout(() => {
      document.querySelector(`[data-regel-id="${regelId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 50)
  }, [regels, groepen])

  useImperativeHandle(ref, () => ({ undo, zetInklap, duwSnapshot, herlaad: laadAlles, wisRegelOpslagen, zetArbeidTarieven, toonRegel }),
    [undo, zetInklap, duwSnapshot, laadAlles, wisRegelOpslagen, zetArbeidTarieven, toonRegel])

  // ─── Selectie ──────────────────────────────────────────────────────────────
  // Anker voor Shift-klik: de laatst los aangeklikte regel.
  const selectieAnker = useRef<string | null>(null)
  const handleSelecteerRegel = useCallback((regelId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // Reeks in de volgorde zoals hij op het scherm staat (groepen, volgorde, ingeklapt
    // telt niet mee). De volgorde van `regels` zelf is de laadvolgorde, niet die van het blad.
    const zichtbaar = Array.from(document.querySelectorAll<HTMLElement>('tr[data-regel-id]')).map(tr => tr.dataset.regelId!)
    const anker = selectieAnker.current
    if (!shiftKey || !anker) selectieAnker.current = regelId
    setGeselecteerdeRegels(prev => {
      const next = new Set(prev)
      if (ctrlKey) {
        // Toggle individual regel
        if (next.has(regelId)) next.delete(regelId)
        else next.add(regelId)
      } else if (shiftKey) {
        // Shift: selecteer bereik in volgorde van alle zichtbare regels
        const fromIdx = anker ? zichtbaar.indexOf(anker) : -1
        const toIdx   = zichtbaar.indexOf(regelId)
        if (fromIdx !== -1 && toIdx !== -1) {
          const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          for (let i = lo; i <= hi; i++) next.add(zichtbaar[i])
        } else {
          next.add(regelId)
        }
      } else {
        // Enkel
        next.clear(); next.add(regelId)
      }
      return next
    })
  }, [])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return  // bevroren calculatie: geen bewerk-sneltoetsen
      const ctrl   = e.ctrlKey || e.metaKey
      const shift  = e.shiftKey
      const tag    = (e.target as HTMLElement).tagName
      const inVeld = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)

      // Browser-shortcuts altijd blokkeren (ook in invoerveld), maar alleen uitvoeren buiten veld
      if (ctrl && !shift && e.key === 'r') {
        e.preventDefault()
        if (inVeld) return
        if (actiefGroepId) handleVoegRegelToe(actiefGroepId)
        else toast('Selecteer eerst een groep', { icon: 'ℹ️' })
        return
      }
      if (ctrl && !shift && e.key === 'g') {
        e.preventDefault()
        if (inVeld) return
        voegRootGroepToe()
        return
      }
      // Ctrl+Shift+R → tekstregel in de actieve groep
      if (ctrl && shift && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        if (inVeld) return
        if (actiefGroepId) handleVoegTekstregelToe(actiefGroepId)
        else toast('Selecteer eerst een groep', { icon: 'ℹ️' })
        return
      }

      // Overige shortcuts: skip als focus in invoerveld
      if (inVeld) return

      // Ctrl+Z → Undo
      if (ctrl && !shift && e.key === 'z') {
        e.preventDefault(); undo(); return
      }
      // Escape → deselecteer
      if (e.key === 'Escape') {
        setGeselecteerdeRegels(new Set()); return
      }
      // Alleen door als er regels geselecteerd zijn
      if (geselecteerdeRegels.size === 0) return

      // Delete / Backspace of Ctrl+Shift+R → verwijder geselecteerde regels
      if (e.key === 'Delete' || e.key === 'Backspace' || (ctrl && shift && e.key === 'R')) {
        e.preventDefault(); handleVerwijderGeselecteerd(); return
      }
      // Ctrl+D → dupliceer (interne kopie + plak direct)
      if (ctrl && !shift && e.key === 'd') {
        e.preventDefault(); handleKopieerRegels(); return
      }
      // Ctrl+C → kopieer naar intern klembord
      if (ctrl && !shift && e.key === 'c') {
        e.preventDefault()
        kopieerNaarKlembord(Array.from(geselecteerdeRegels))
        return
      }
      // Ctrl+X → knip (kopieer + verwijder)
      if (ctrl && !shift && e.key === 'x') {
        e.preventDefault()
        kopieerNaarKlembord(Array.from(geselecteerdeRegels), true)
        handleVerwijderGeselecteerd()
        toast.success(`${klembordRegels.current.length} regel${klembordRegels.current.length !== 1 ? 's' : ''} geknipt`)
        return
      }
      // Ctrl+V → plak na geselecteerde regel (of achteraan actieve groep)
      if (ctrl && !shift && e.key === 'v') {
        e.preventDefault()
        if (klembordRegels.current.length === 0) return
        // Bepaal ankerpunt: geselecteerde regel of actieve groep
        const geselecteerdArr = Array.from(geselecteerdeRegels)
        const ankerRegel = geselecteerdArr.length === 1
          ? regels.find(r => r.id === geselecteerdArr[0])
          : null
        const doelGroepId = ankerRegel?.groep_id ?? actiefGroepId
        if (!doelGroepId) return
        duwSnapshot()
        // Regels in doelgroep gesorteerd; invoegen na anker (of achteraan)
        const doelRegels = regels.filter(r => r.groep_id === doelGroepId).sort((a, b) => a.volgorde - b.volgorde)
        const ankerIdx   = ankerRegel ? doelRegels.findIndex(r => r.id === ankerRegel.id) : doelRegels.length - 1
        const startVolgorde = ankerIdx + 2  // 1-based, na anker
        // Schuif bestaande regels na anker op
        doelRegels.slice(ankerIdx + 1).forEach((r, i) => {
          slaCalculatieregelOp({ ...r, volgorde: startVolgorde + klembordRegels.current.length + i })
        })
        const geplakt: Calculatieregel[] = []
        klembordRegels.current.forEach((orig, i) => {
          const nieuw: Calculatieregel = {
            ...orig, id: nieuweId(),
            groep_id: doelGroepId,
            volgorde: startVolgorde + i,
          }
          slaCalculatieregelOp(nieuw)
          klembordComponenten.current
            .filter(c => c.calculatieregel_id === orig.id)
            .forEach(comp => slaComponentregelOp({ ...comp, id: nieuweId(), calculatieregel_id: nieuw.id }))
          geplakt.push(nieuw)
        })
        laadAlles(); onWijziging()
        setGeselecteerdeRegels(new Set(geplakt.map(r => r.id)))
        toast.success(`${geplakt.length} regel${geplakt.length !== 1 ? 's' : ''} geplakt`)
        return
      }
      // Ctrl+M → verplaats naar andere groep
      if (ctrl && !shift && e.key === 'm') {
        e.preventDefault(); setVerplaatsModalOpen(true); return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, geselecteerdeRegels, actiefGroepId, regels, componenten, duwSnapshot, laadAlles, onWijziging, readOnly])

  // ─── Multi-select acties ───────────────────────────────────────────────────
  /** Regels in het interne klembord zetten (Ctrl+C / Ctrl+X, of Kopiëren in het regelmenu). */
  const kopieerNaarKlembord = useCallback((ids: string[], stil = false) => {
    const set = new Set(ids)
    klembordRegels.current = ids
      .map(id => regels.find(r => r.id === id))
      .filter((r): r is Calculatieregel => !!r)
    klembordComponenten.current = componenten.filter(c => set.has(c.calculatieregel_id))
    const n = klembordRegels.current.length
    if (!stil) toast.success(`${n} regel${n !== 1 ? 's' : ''} gekopieerd — plak met Ctrl+V`)
  }, [regels, componenten])

  /** Dupliceren: de geselecteerde regels, of alleen `alleen` (regelmenu). */
  const handleKopieerRegels = useCallback((alleen?: string[]) => {
    const ids = alleen ?? Array.from(geselecteerdeRegels)
    if (ids.length === 0) return
    duwSnapshot()
    const nieuwRegels: Calculatieregel[] = []
    ids.forEach(id => {
      const orig = regels.find(r => r.id === id)
      if (!orig) return
      const kopie: Calculatieregel = { ...orig, id: nieuweId(), omschrijving: `${orig.omschrijving} (kopie)`, volgorde: regels.filter(r => r.groep_id === orig.groep_id).length + nieuwRegels.filter(r => r.groep_id === orig.groep_id).length + 1 }
      slaCalculatieregelOp(kopie)
      // Kopieer ook componentregels
      componenten.filter(c => c.calculatieregel_id === id).forEach(comp => {
        const nieuwComp: Componentregel = { ...comp, id: nieuweId(), calculatieregel_id: kopie.id }
        slaComponentregelOp(nieuwComp)
      })
      nieuwRegels.push(kopie)
    })
    laadAlles(); onWijziging()
    setGeselecteerdeRegels(new Set(nieuwRegels.map(r => r.id)))
    toast.success(`${nieuwRegels.length} regel${nieuwRegels.length !== 1 ? 's' : ''} gekopieerd`)
  }, [geselecteerdeRegels, regels, componenten, duwSnapshot, laadAlles, onWijziging])

  const handleVerwijderGeselecteerd = useCallback(() => {
    if (geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => verwijderCalculatieregel(id))
    setRegels(prev => prev.filter(r => !geselecteerdeRegels.has(r.id)))
    setComponenten(prev => prev.filter(c => !geselecteerdeRegels.has(c.calculatieregel_id)))
    setGeselecteerdeRegels(new Set())
    onWijziging()
    toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} verwijderd`)
  }, [geselecteerdeRegels, duwSnapshot, onWijziging])

  // Bijwerken van gekoppeld MeetregelAggregaat na groep-verplaatsing
  const syncAggregaatGroep = useCallback((regelId: string, nieuweGroepId: string) => {
    const aggs = getMeetregelAggregaten()
    const agg  = aggs.find(a => a.calculatieregel_id === regelId)
    if (agg && agg.groep_id !== nieuweGroepId) {
      slaMeetregelAggregaatOp({ ...agg, groep_id: nieuweGroepId })
    }
  }, [])

  const handleVerplaatsNaarGroep = useCallback((doelGroepId: string) => {
    if (geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    const doelRegels = regels.filter(r => r.groep_id === doelGroepId)
    let volgorde = doelRegels.length + 1
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      const bijgewerkt = { ...r, groep_id: doelGroepId, volgorde: volgorde++ }
      slaCalculatieregelOp(bijgewerkt)
      syncAggregaatGroep(id, doelGroepId)
    })
    laadAlles(); onWijziging()
    setVerplaatsModalOpen(false)
    setGeselecteerdeRegels(new Set())
    toast.success(`${ids.length} regel${ids.length !== 1 ? 's' : ''} verplaatst`)
  }, [geselecteerdeRegels, regels, duwSnapshot, laadAlles, onWijziging])

  /** Zet het opslagpercentage van de hele selectie. `undefined` betekent: geen eigen
   *  opslag meer, dus terug naar de standaard-opslag van de calculatie. */
  const handleZetOpslagGeselecteerd = useCallback((pct: number | undefined) => {
    if (readOnly || geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      slaCalculatieregelOp({ ...r, opslag_pct: pct })
      // Een eigen opslag per component wint van die van de regel; zonder deze wis
      // zou er niets veranderen aan regels waar per component een opslag staat.
      componenten
        .filter(c => c.calculatieregel_id === id && c.opslag_pct !== undefined)
        .forEach(c => slaComponentregelOp({ ...c, opslag_pct: undefined }))
    })
    laadAlles(); onWijziging()
    setOpslagModalOpen(false)
    const aantal = `${ids.length} regel${ids.length !== 1 ? 's' : ''}`
    toast.success(pct === undefined
      ? `${aantal} terug op de standaard-opslag`
      : `Opslag ${formatGetal(pct, 2)}% op ${aantal}`)
  }, [readOnly, geselecteerdeRegels, regels, componenten, duwSnapshot, laadAlles, onWijziging])

  /** Zet het BTW-tarief van de hele selectie. Een lege keuze wist het tarief. */
  const handleZetBtwGeselecteerd = useCallback((tariefId: string) => {
    if (readOnly || geselecteerdeRegels.size === 0) return
    duwSnapshot()
    const patch = kiesBtwTarief(btwTarieven, tariefId)
    const ids = Array.from(geselecteerdeRegels)
    ids.forEach(id => {
      const r = regels.find(r => r.id === id)
      if (!r) return
      slaCalculatieregelOp({ ...r, ...patch })
    })
    laadAlles(); onWijziging()
    setBtwModalOpen(false)
    const gekozen = vindTarief(btwTarieven, patch.btw_tarief_id, patch.btw_pct)
    toast.success(`${gekozen ? tariefKort(gekozen) : 'Geen BTW'} op ${ids.length} regel${ids.length !== 1 ? 's' : ''}`)
  }, [readOnly, geselecteerdeRegels, regels, btwTarieven, duwSnapshot, laadAlles, onWijziging])

  /** Opent het opslagvenster met het huidige percentage als de selectie er één deelt. */
  const opentOpslagModal = useCallback(() => {
    const waarden = new Set(
      Array.from(geselecteerdeRegels).map(id => regels.find(r => r.id === id)?.opslag_pct),
    )
    const enige = waarden.size === 1 ? Array.from(waarden)[0] : undefined
    setOpslagInvoer(enige === undefined ? '' : String(+enige.toFixed(2)))
    setOpslagModalOpen(true)
  }, [geselecteerdeRegels, regels])

  // ─── Kolom resize ───────────────────────────────────────────────────────────
  const startResize = (col: ColId, e: React.MouseEvent) => {
    const startX = e.clientX
    const startW = colWidths[col]
    resizeRef.current = { col, startX, startW }
    const onMove = (me: MouseEvent) => {
      if (!resizeRef.current) return
      const newW = Math.max(COL_MAP[col].minW, startW + me.clientX - startX)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Kolom drag reorder ────────────────────────────────────────────────────
  const onColDragStart = (col: ColId) => setDragCol(col)
  const onColDragOver  = (e: React.DragEvent, col: ColId) => {
    e.preventDefault()
    if (dragCol && dragCol !== col) setDragOverCol(col)
  }
  const onColDrop = (col: ColId) => {
    if (!dragCol || dragCol === col) { setDragCol(null); setDragOverCol(null); return }
    setColOrder(prev => {
      const next = [...prev]
      const fi = next.indexOf(dragCol); const ti = next.indexOf(col)
      next.splice(fi, 1); next.splice(ti, 0, dragCol)
      return next
    })
    setDragCol(null); setDragOverCol(null)
  }
  const onColDragEnd = () => { setDragCol(null); setDragOverCol(null) }

  // ─── Regel drag & drop ─────────────────────────────────────────────────────
  const handleRegelDragStartGrid = useCallback((id: string) => {
    setSleepRegelId(id)
    // Sleep je een regel uit een bestaande selectie, dan gaat de hele selectie mee.
    setSleepRegelIds(
      geselecteerdeRegels.has(id) && geselecteerdeRegels.size > 1
        ? new Set(geselecteerdeRegels)
        : new Set([id]),
    )
  }, [geselecteerdeRegels])

  const handleDragEnd = useCallback(() => {
    setSleepRegelId(null); setSleepRegelIds(new Set()); setDragOverId(null)
  }, [])

  /** Volgorde waarin de groepen in het rekenblad staan — bepaalt de leesvolgorde
   *  waarin meerdere gesleepte regels bij elkaar worden gezet. */
  const groepVolgordeIndex = useMemo(() => {
    const map = new Map<string, number>()
    let i = 0
    const loop = (parentId: string | null) => {
      groepen.filter(g => g.parent_id === parentId).sort((a, b) => a.volgorde - b.volgorde)
        .forEach(g => { map.set(g.id, i++); loop(g.id) })
    }
    loop(null)
    return map
  }, [groepen])

  const handleVerplaatsRegelsNaarPositie = useCallback((
    regelIds: string[], doelGroepId: string, voorRegelId: string | null,
  ) => {
    const ids = new Set(regelIds)
    if (voorRegelId && ids.has(voorRegelId)) return   // droppen op jezelf
    const teVerplaatsen = regels
      .filter(r => ids.has(r.id))
      .sort((a, b) =>
        (groepVolgordeIndex.get(a.groep_id) ?? 0) - (groepVolgordeIndex.get(b.groep_id) ?? 0)
        || a.volgorde - b.volgorde)
    if (teVerplaatsen.length === 0) return
    duwSnapshot()

    // Doelgroep opnieuw opbouwen: bestaande regels zonder de gesleepte, dan invoegen
    const doelRegels = regels
      .filter(r => r.groep_id === doelGroepId && !ids.has(r.id))
      .sort((a, b) => a.volgorde - b.volgorde)
    const invoegenIdx = voorRegelId
      ? Math.max(0, doelRegels.findIndex(r => r.id === voorRegelId))
      : doelRegels.length
    doelRegels.splice(invoegenIdx, 0, ...teVerplaatsen.map(r => ({ ...r, groep_id: doelGroepId })))
    doelRegels.forEach((r, i) => slaCalculatieregelOp({ ...r, volgorde: i + 1 }))

    // Brongroepen dichttrekken en de meetstaat-koppeling meeverhuizen
    const bronGroepen = new Set(teVerplaatsen.map(r => r.groep_id).filter(gid => gid !== doelGroepId))
    bronGroepen.forEach(gid => {
      regels.filter(r => r.groep_id === gid && !ids.has(r.id))
        .sort((a, b) => a.volgorde - b.volgorde)
        .forEach((r, i) => slaCalculatieregelOp({ ...r, volgorde: i + 1 }))
    })
    teVerplaatsen.forEach(r => { if (r.groep_id !== doelGroepId) syncAggregaatGroep(r.id, doelGroepId) })

    setSleepRegelId(null); setSleepRegelIds(new Set()); setDragOverId(null)
    laadAlles(); onWijziging()
    const n = teVerplaatsen.length
    toast.success(`${n} regel${n !== 1 ? 's' : ''} verplaatst`)
  }, [regels, groepVolgordeIndex, duwSnapshot, laadAlles, onWijziging, syncAggregaatGroep])

  /** Een régel boven een groepskop: die groep licht op als doel. */
  const handleDragOver = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (sleepRegelId) setDragOverId(doel.id)
  }, [sleepRegelId])

  /** Drop op een groepskop → de regels achteraan die groep plaatsen. */
  const handleDrop = useCallback((e: React.DragEvent, doel: Groep) => {
    e.preventDefault()
    if (sleepRegelIds.size > 0) handleVerplaatsRegelsNaarPositie([...sleepRegelIds], doel.id, null)
  }, [sleepRegelIds, handleVerplaatsRegelsNaarPositie])

  // ─── Mutaties ──────────────────────────────────────────────────────────────
  const handleRegelWijzig = useCallback((id: string, veld: Partial<Calculatieregel>) => {
    setRegels(prev => {
      const bijgewerkt = prev.map(r => r.id === id ? { ...r, ...veld } : r)
      const r = bijgewerkt.find(r => r.id === id)
      if (r) slaCalculatieregelOp(r)
      return bijgewerkt
    })
    const alleenTekst = Object.keys(veld).every(k => TEKSTVELDEN.has(k))
    if (alleenTekst && onTekstWijziging) onTekstWijziging()
    else onWijziging()
  }, [onWijziging, onTekstWijziging])

  const handleComponentWijzig = useCallback((
    regelId: string, type: Componentregel['type'], norm: number, tarief: number
  ) => {
    upsertComponentregel(regelId, type, norm, tarief)
    const groepIds = new Set(groepen.map(g => g.id))
    const rs = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds = new Set(rs.map(r => r.id))
    setComponenten(getComponentregels().filter(c => regelIds.has(c.calculatieregel_id)))
    onWijziging()
  }, [groepen, onWijziging])

  const handleVerwijderRegel = useCallback((id: string) => {
    duwSnapshot()
    verwijderCalculatieregel(id)
    setRegels(prev => prev.filter(r => r.id !== id))
    setComponenten(prev => prev.filter(c => c.calculatieregel_id !== id))
    onWijziging(); toast.success('Regel verwijderd')
  }, [duwSnapshot, onWijziging])

  /** Acties uit het ⋯-menu van één regel. Werken op die regel, los van de selectie. */
  const handleRegelActie = useCallback((id: string, actie: RegelActie) => {
    if (actie === 'dupliceren') handleKopieerRegels([id])
    else if (actie === 'kopieren') kopieerNaarKlembord([id])
    else if (actie === 'verplaatsen') { setGeselecteerdeRegels(new Set([id])); setVerplaatsModalOpen(true) }
    else if (actie === 'verwijderen') handleVerwijderRegel(id)
  }, [handleKopieerRegels, kopieerNaarKlembord, handleVerwijderRegel])

  const handleVerwijderGroep = useCallback((id: string) => {
    duwSnapshot()
    verwijderGroep(id); laadAlles(); onWijziging(); toast.success('Groep verwijderd')
  }, [duwSnapshot, laadAlles, onWijziging])

  const handleWijzigGroep = useCallback((id: string, patch: Partial<Groep>) => {
    const groep = groepen.find(g => g.id === id)
    if (!groep) return
    const bijgewerkt = { ...groep, ...patch }
    slaGroepOp(bijgewerkt)
    setGroepen(prev => prev.map(g => g.id === id ? bijgewerkt : g))
    onWijziging()
  }, [groepen, onWijziging])

  const handleWijzigComponentExtra = useCallback((compId: string, patch: Partial<Componentregel>) => {
    const comp = componenten.find(c => c.id === compId)
    if (!comp) return
    const bijgewerkt = slaComponentregelOp({ ...comp, ...patch })
    setComponenten(prev => prev.map(c => c.id === compId ? bijgewerkt : c))
  }, [componenten])

  const handleVoegComponentToe = useCallback((regelId: string, type: Componentregel['type']) => {
    // Het standaard uurtarief van de calculatie (of anders dat uit de
    // bedrijfsinstellingen) wordt in de store zelf op het component gezet.
    const nieuw = voegComponentregelToe(regelId, type)
    setComponenten(prev => [...prev, nieuw])
    onWijziging()
  }, [onWijziging])

  const handleVerwijderComponent = useCallback((compId: string) => {
    verwijderComponentregel(compId)
    setComponenten(prev => prev.filter(c => c.id !== compId))
    onWijziging()
  }, [onWijziging])

  const handleVoegRegelToe = useCallback((groepId: string) => {
    duwSnapshot()
    const volgorde = regels.filter(r => r.groep_id === groepId).length + 1
    const standaardBtw = scenario.btw_tarief_id_default
      ? kiesBtwTarief(btwTarieven, scenario.btw_tarief_id_default)
      : { btw_pct: scenario.btw_pct_default ?? undefined }
    const nieuw: Calculatieregel = {
      id: nieuweId(), groep_id: groepId, omschrijving: '', hoeveelheid: 1, eenheid: 'st', volgorde,
      ...standaardBtw,
    }
    slaCalculatieregelOp(nieuw)
    setRegels(prev => [...prev, nieuw])
    onWijziging()
  }, [duwSnapshot, regels, onWijziging, scenario, btwTarieven])

  /**
   * Tekstregel: alleen woorden. Bewust zonder BTW-tarief en met hoeveelheid 0 —
   * hij hoort nergens in mee te tellen, en zo kan hij dat ook niet per ongeluk
   * gaan doen als er ooit toch een bedrag aan zou hangen.
   */
  const handleVoegTekstregelToe = useCallback((groepId: string) => {
    duwSnapshot()
    const volgorde = regels.filter(r => r.groep_id === groepId).length + 1
    const nieuw: Calculatieregel = {
      id: nieuweId(), groep_id: groepId, omschrijving: '', hoeveelheid: 0, eenheid: 'st', volgorde,
      soort: 'tekst',
    }
    slaCalculatieregelOp(nieuw)
    setRegels(prev => [...prev, nieuw])
    onWijziging()
  }, [duwSnapshot, regels, onWijziging])

  const handleVoegSubgroepToe = useCallback((parent: Groep) => {
    setNieuwGroepParent(parent); setNieuwGroepNaam('')
  }, [])

  const bevestigSubgroep = () => {
    if (!nieuwGroepParent || !nieuwGroepNaam.trim()) return
    const nieuw: Groep = {
      id: nieuweId(), scenario_id: scenarioId,
      parent_id: nieuwGroepParent.id,
      naam: nieuwGroepNaam.trim(),
      niveau: (nieuwGroepParent.niveau + 1) as 1 | 2 | 3,
      volgorde: groepen.filter(g => g.parent_id === nieuwGroepParent.id).length + 1,
    }
    slaGroepOp(nieuw); laadAlles(); onWijziging()
    setNieuwGroepParent(null); setNieuwGroepNaam('')
  }

  const voegRootGroepToe = () => {
    setNieuwRootGroepNaam(''); setNieuwRootGroepOpen(true)
  }

  const bevestigRootGroep = () => {
    if (!nieuwRootGroepNaam.trim()) return
    const nieuw: Groep = {
      id: nieuweId(), scenario_id: scenarioId, parent_id: null,
      naam: nieuwRootGroepNaam.trim(), niveau: 1,
      volgorde: groepen.filter(g => g.parent_id === null).length + 1,
    }
    slaGroepOp(nieuw); laadAlles(); onWijziging()
    setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('')
  }

  // Optionele groepen niet meerekenen in eindtotaal
  const optioneleIds = new Set(
    groepen.filter(g => {
      // Een groep is optioneel als hijzelf optioneel is, of als een ancestor optioneel is
      let current: Groep | undefined = g
      while (current) {
        if (current.optioneel) return true
        current = groepen.find(p => p.id === current!.parent_id)
      }
      return false
    }).map(g => g.id)
  )
  const groepenZonderOptioneel = groepen.filter(g => !optioneleIds.has(g.id))
  const totaalKP    = berekenScenarioKostprijs(groepenZonderOptioneel, regels, componenten)
  const totaalVP    = berekenScenarioVP(groepenZonderOptioneel, regels, componenten, defaultOpslag)
  const totaalUren  = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepUren(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const totaalMT    = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepMaterieel(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const totaalOA    = groepenZonderOptioneel.filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepOA(g.id, groepenZonderOptioneel, regels, componenten), 0)
  const roots    = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)
  const visibleColOrder = colOrder.filter(id => !hiddenCols.has(id))
  const totalW   = visibleColOrder.reduce((s, id) => s + colWidths[id], 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

      {/* Sub-header: selectie-acties (alleen zichtbaar bij actieve selectie) */}
      {geselecteerdeRegels.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-everts">{geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} geselecteerd</span>
          <span className="text-slate-300 text-xs">·</span>
          <button
            onClick={() => handleKopieerRegels()}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Kopieer geselecteerde regels (Ctrl+D)"
          >
            <CopyPlus className="w-3 h-3" /> Kopiëren
          </button>
          <button
            onClick={() => setVerplaatsModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Verplaats naar andere groep (Ctrl+M)"
          >
            <Move className="w-3 h-3" /> Verplaatsen
          </button>
          <button
            onClick={opentOpslagModal}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="Opslag% van de geselecteerde regels wijzigen"
          >
            <Percent className="w-3 h-3" /> Opslag%
          </button>
          <button
            onClick={() => setBtwModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title="BTW-tarief van de geselecteerde regels wijzigen"
          >
            <Receipt className="w-3 h-3" /> BTW
          </button>
          <button
            onClick={handleVerwijderGeselecteerd}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            title="Verwijder geselecteerde regels (Delete)"
          >
            <Trash2 className="w-3 h-3" /> Verwijderen
          </button>
          <button
            onClick={() => setGeselecteerdeRegels(new Set())}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-400 hover:text-slate-600"
            title="Deselecteer (Escape)"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Root-groep inline dialog */}
      {nieuwRootGroepOpen && (
        <div className="px-4 py-2.5 bg-everts-dark border-b border-everts/30 flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-medium text-white/80 whitespace-nowrap">Nieuwe hoofdgroep:</span>
          <input
            autoFocus
            value={nieuwRootGroepNaam}
            onChange={e => setNieuwRootGroepNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') bevestigRootGroep(); if (e.key === 'Escape') { setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('') } }}
            placeholder="Naam van de groep..."
            className="flex-1 text-xs px-3 py-1.5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 bg-paper/10 text-white placeholder-white/40"
          />
          <button
            onClick={bevestigRootGroep}
            disabled={!nieuwRootGroepNaam.trim()}
            className="text-xs bg-white text-everts-dark font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Toevoegen
          </button>
          <button
            onClick={() => { setNieuwRootGroepOpen(false); setNieuwRootGroepNaam('') }}
            className="text-xs text-white/50 hover:text-white/80 px-1 transition-colors"
          >
            Annuleer
          </button>
        </div>
      )}

      {/* Subgroep inline form */}
      {nieuwGroepParent && (
        <div className="px-4 py-2 bg-everts-50 border-b border-everts/20 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-600">
            Subgroep onder <strong>{nieuwGroepParent.naam}</strong>:
          </span>
          <input
            autoFocus
            value={nieuwGroepNaam}
            onChange={e => setNieuwGroepNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') bevestigSubgroep(); if (e.key === 'Escape') setNieuwGroepParent(null) }}
            placeholder="Naam subgroep..."
            className="flex-1 text-xs px-2 py-1 border border-everts/40 rounded focus:outline-none focus:ring-1 focus:ring-everts bg-white"
          />
          <button onClick={bevestigSubgroep} className="text-xs bg-everts text-white px-2 py-1 rounded hover:bg-everts-dark">✓</button>
          <button onClick={() => setNieuwGroepParent(null)} className="text-xs text-slate-400 px-1 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Datalist voor kostengroep autocomplete */}
      <datalist id="kg-suggestions">
        {[...new Set(regels.map(r => r.kostengroep).filter((kg): kg is string => Boolean(kg)))].map(kg => (
          <option key={kg} value={kg} />
        ))}
      </datalist>

      {/* Kolom hover CSS */}
      <style>{visibleColOrder.map(id =>
        `#calc-tabel[data-hcol="${id}"] [data-col="${id}"] { background-color: rgba(219,234,254,0.35) !important; }`
      ).join(' ')}</style>

      {/* Kolom-layouts + kolommen-picker: gerenderd in de werkbalk (naast inklappen)
          via een portal in #calc-grid-toolbar-slot. */}
      {toolbarSlot && createPortal(
        <>
        {userId && (
          <div ref={layoutMenuRef} className="relative">
            <button
              onClick={() => setLayoutMenuOpen(v => !v)}
              className={`inline-flex items-center gap-1 h-7 text-xs font-semibold px-2.5 rounded-md border transition-colors ${
                actiefLayoutId
                  ? 'border-everts/40 bg-everts-50 text-everts font-medium'
                  : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400'
              }`}
              title="Kolom-layouts (per gebruiker)"
            >
              <ChevronDown className="w-3 h-3" />
              {actiefLayoutId ? (layouts.find(l => l.id === actiefLayoutId)?.naam ?? 'Layout') : 'Layouts'}
            </button>
            {layoutMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-[150] min-w-[240px]">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 mb-1">
                  Kolom-layouts
                </div>
                {/* Layout uitzetten zonder hem te verwijderen: terug naar de gewone kolommen. */}
                <button
                  onClick={() => { setActiefLayoutId(null); setColOrder(DEFAULT_ORDER); setColWidths(DEFAULT_WIDTHS); setHiddenCols(new Set()); setLayoutMenuOpen(false) }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-slate-50 ${actiefLayoutId ? 'text-slate-700' : 'text-everts font-medium bg-everts-50/60'}`}
                  title="Geen layout — alle kolommen in de standaardvolgorde en -breedte"
                >
                  Standaardkolommen
                </button>
                {layouts.length === 0 && (
                  <div className="px-3 py-1.5 text-xs text-slate-400">Nog geen opgeslagen layouts</div>
                )}
                {layouts.map(l => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-1 px-2 py-1 hover:bg-slate-50 ${actiefLayoutId === l.id ? 'bg-everts-50/60' : ''}`}
                  >
                    <button
                      onClick={() => { pasLayoutToe(l.kolommen, l.id); setLayoutMenuOpen(false) }}
                      className="flex-1 min-w-0 text-left text-xs text-slate-700 truncate px-1 py-0.5"
                      title="Layout toepassen"
                    >
                      {l.is_standaard && <span className="text-amber-500 mr-1">★</span>}
                      {l.naam}
                    </button>
                    {!l.is_standaard && (
                      <button
                        onClick={() => layoutStandaardZetten(l.id)}
                        className="flex-shrink-0 p-1 text-slate-300 hover:text-amber-500 rounded"
                        title="Als standaard instellen"
                      >★</button>
                    )}
                    <button
                      onClick={() => layoutVerwijderen(l.id)}
                      className="flex-shrink-0 p-1 text-slate-300 hover:text-red-500 rounded"
                      title="Layout verwijderen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  {actiefLayoutId && (
                    <button
                      onClick={layoutBijwerken}
                      className="w-full text-left px-3 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                    >
                      Actieve layout bijwerken
                    </button>
                  )}
                  <button
                    onClick={layoutOpslaanAlsNieuw}
                    className="w-full text-left px-3 py-1 text-xs text-everts hover:bg-everts-50 font-medium"
                  >
                    Huidige kolommen opslaan als nieuw…
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={colPickerRef} className="relative">
          <button
            onClick={() => setColPickerOpen(v => !v)}
            className={`inline-flex items-center gap-1 h-7 text-xs font-semibold px-2.5 rounded-md border transition-colors ${
              hiddenCols.size > 0
                ? 'border-everts/40 bg-everts-50 text-everts font-medium'
                : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400'
            }`}
            title="Kolommen tonen/verbergen"
          >
            <ChevronDown className="w-3 h-3" />
            Kolommen{hiddenCols.size > 0 ? ` (${hiddenCols.size} verborgen)` : ''}
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-[150] w-[300px] max-h-[70vh] overflow-auto">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 mb-1">
                Kolommen tonen en hernoemen
              </div>
              {COL_DEFS.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.id)}
                    disabled={NON_HIDEABLE.includes(c.id)}
                    onChange={() => toggleHiddenCol(c.id)}
                    className="w-3.5 h-3.5 rounded accent-everts flex-shrink-0 disabled:opacity-30"
                    title={NON_HIDEABLE.includes(c.id) ? 'Deze kolom is altijd zichtbaar' : 'Kolom tonen/verbergen'}
                  />
                  <KolomNaamVeld
                    waarde={colNamen[c.id] ?? ''}
                    standaard={standaardKolomNaam(c.id)}
                    onCommit={naam => zetKolomNaam(c.id, naam)}
                  />
                </div>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <p className="px-3 py-1 text-[10px] text-slate-400 leading-snug">
                  Eigen kolomnamen gelden alleen voor jou. Leeg laten = standaardnaam.
                  Je kunt ook dubbelklikken op een kolomkop.
                </p>
                {hiddenCols.size > 0 && (
                  <button
                    onClick={() => setHiddenCols(new Set())}
                    className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  >
                    Alle kolommen tonen
                  </button>
                )}
                {Object.keys(colNamen).length > 0 && (
                  <button
                    onClick={() => { setColNamen({}); void bewaarKolomNamen({}) }}
                    className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  >
                    Kolomnamen herstellen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </>,
        toolbarSlot,
      )}

      {/* Bevroren: houd disabled velden goed leesbaar (geen UA-grijs) */}
      {readOnly && (
        <style>{`fieldset.calc-fs:disabled input, fieldset.calc-fs:disabled select, fieldset.calc-fs:disabled textarea {
          -webkit-text-fill-color: currentColor !important; opacity: 1 !important; cursor: default !important;
        }`}</style>
      )}

      {/* Tabel — bij een bevroren calculatie disablen we alle formuliervelden via
          <fieldset disabled>; in/uitklappen blijft werken (die knoppen zijn <span>). */}
      <fieldset
        disabled={readOnly}
        className="calc-fs flex-1 overflow-auto min-h-0 min-w-0 border-0 p-0 m-0"
      >
        {roots.length > 0 ? (
          <table
            id="calc-tabel"
            ref={tabelRef}
            className="border-collapse text-sm w-full"
            style={{ tableLayout: 'fixed', minWidth: `${totalW}px` }}
            onMouseOver={e => {
              const cell = (e.target as HTMLElement).closest('[data-col]')
              const col  = cell?.getAttribute('data-col')
              if (col && tabelRef.current) tabelRef.current.dataset.hcol = col
            }}
            onMouseLeave={() => { if (tabelRef.current) delete tabelRef.current.dataset.hcol }}
          >
            <colgroup>
              {visibleColOrder.map(id => <col key={id} style={{ width: colWidths[id] }} />)}
            </colgroup>
            <TabelHeader
              colOrder={visibleColOrder} colWidths={colWidths} kolomNamen={effectieveKolomNamen}
              onHernoem={zetKolomNaam}
              onStartResize={startResize} dragOverCol={dragOverCol}
              onColDragStart={onColDragStart} onColDragOver={onColDragOver}
              onColDrop={onColDrop} onColDragEnd={onColDragEnd}
            />
            <tbody>
              {roots.map(g => (
                <GroepSectie
                  key={g.id} groep={g} diepte={0}
                  alleGroepen={groepen} alleRegels={regels} alleComponenten={componenten}
                  nummers={nummers} isActief={actiefGroepId === g.id}
                  defaultOpslag={defaultOpslag} standaardTarief={scenario.standaard_uurtarief} colOrder={visibleColOrder} btwTarieven={btwTarieven}
                  uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={laadAlles}
                  onKlik={onGroepActief}
                  onRegelWijzig={handleRegelWijzig}
                  onRegelComponentWijzig={handleComponentWijzig}
                  onWijzigComponentExtra={handleWijzigComponentExtra}
                  onVoegComponentToe={handleVoegComponentToe}
                  onVerwijderComponent={handleVerwijderComponent}
                  onVerwijderRegel={handleVerwijderRegel}
                  onVerwijderGroep={handleVerwijderGroep}
                  onWijzigGroep={handleWijzigGroep} onToggleInklap={handleToggleInklap}
                  onVoegRegelToe={handleVoegRegelToe}
                  onVoegTekstregelToe={handleVoegTekstregelToe}
                  onVoegSubgroepToe={handleVoegSubgroepToe}
                  dragOverGroepId={dragOverId} sleepRegelId={sleepRegelId} sleepRegelIds={sleepRegelIds}
                  onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd}
                  onRegelDragStartNaarGroep={handleRegelDragStartGrid}
                  onRegelDragEnd={handleDragEnd}
                  onRegelVerplaatsNaarPositie={handleVerplaatsRegelsNaarPositie}
                  bibliotheekItems={bibliotheekItems}
                  behandelingen={behandelingen}
                  geselecteerdeRegels={geselecteerdeRegels}
                  onSelecteerRegel={handleSelecteerRegel}
                  onRegelActie={handleRegelActie}
                  collapseSignal={collapseSignal}
                  readOnly={readOnly}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                {visibleColOrder.map(id => {
                  if (id === 'omschrijving') return (
                    <td key={id} className="px-3 py-3 text-sm font-bold text-slate-700">Totaal calculatie</td>
                  )
                  if (id === 'bedrag_mt') return (
                    <td key={id} className="px-3 py-3 text-right bg-red-50/40">
                      {totaalMT !== 0 && <span className=" text-sm font-bold text-red-700">{formatEuro(totaalMT)}</span>}
                    </td>
                  )
                  if (id === 'bedrag_oa') return (
                    <td key={id} className="px-3 py-3 text-right bg-purple-50/40">
                      {totaalOA !== 0 && <span className=" text-sm font-bold text-purple-700">{formatEuro(totaalOA)}</span>}
                    </td>
                  )
                  if (id === 'tot_uren') return (
                    <td key={id} className="px-3 py-3 text-right bg-blue-50/40">
                      {totaalUren !== 0 && <span className=" text-sm font-bold text-blue-700">{formatGetal(totaalUren, 2)}</span>}
                    </td>
                  )
                  if (id === 'tot_kp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50">
                      <span className=" text-base font-bold text-everts-dark">{formatEuro(totaalKP)}</span>
                    </td>
                  )
                  if (id === 'tot_vp') return (
                    <td key={id} className="px-3 py-3 text-left bg-everts-50/80">
                      <span className=" text-base font-bold text-everts">{formatEuro(totaalVP)}</span>
                    </td>
                  )
                  return <td key={id} />
                })}
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-24 text-center">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-slate-500 font-semibold mb-1">Nog geen groepen aangemaakt</p>
            <p className="text-slate-400 text-sm mb-5">Maak een groep aan om te beginnen.</p>
            <button
              onClick={voegRootGroepToe}
              className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Eerste groep aanmaken
            </button>
          </div>
        )}
      </fieldset>

      {/* ─── Verplaats naar groep modal ──────────────────────────────────── */}
      {verplaatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setVerplaatsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">Verplaats naar groep</h2>
              <button onClick={() => setVerplaatsModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">{geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} verplaatsen naar:</p>
            <div className="overflow-auto flex-1 space-y-1">
              {groepen.map(g => {
                const nummer = nummers.get(g.id) ?? ''
                const indent = (g.niveau - 1) * 12
                return (
                  <button
                    key={g.id}
                    onClick={() => handleVerplaatsNaarGroep(g.id)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-everts-50 hover:text-everts-dark transition-colors flex items-center gap-2"
                    style={{ paddingLeft: `${12 + indent}px` }}
                  >
                    {nummer && <span className=" text-slate-400 text-[10px]">{nummer}</span>}
                    <span className="truncate">{g.naam}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Opslag% van de selectie ──────────────────────────────────────── */}
      {opslagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpslagModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">Opslag% wijzigen</h2>
              <button onClick={() => setOpslagModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} krijgen dit opslagpercentage:
            </p>
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text" inputMode="decimal"
                value={opslagInvoer}
                placeholder={formatGetal(defaultOpslag, 2)}
                onChange={e => setOpslagInvoer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && opslagInvoer.trim() !== '') handleZetOpslagGeselecteerd(parseGetal(opslagInvoer))
                  if (e.key === 'Escape') setOpslagModalOpen(false)
                }}
                className="flex-1 text-sm text-right px-2 py-1.5 rounded-lg border border-slate-200 focus:border-everts/40 focus:ring-2 focus:ring-everts/20 focus:outline-none text-slate-700"
              />
              <span className="text-slate-400 text-xs">%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Een eigen opslag per component (arbeid, materieel, onderaanneming) wordt gewist.
            </p>
            <div className="flex items-center justify-between gap-2 mt-4">
              <button
                onClick={() => handleZetOpslagGeselecteerd(undefined)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Geen eigen opslag: volg de standaard van de calculatie"
              >
                Standaard ({formatGetal(defaultOpslag, 2)}%)
              </button>
              <button
                disabled={opslagInvoer.trim() === ''}
                onClick={() => handleZetOpslagGeselecteerd(parseGetal(opslagInvoer))}
                className="text-xs bg-everts hover:bg-everts-dark text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Toepassen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── BTW-tarief van de selectie ───────────────────────────────────── */}
      {btwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBtwModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 text-sm">BTW-tarief wijzigen</h2>
              <button onClick={() => setBtwModalOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {geselecteerdeRegels.size} regel{geselecteerdeRegels.size !== 1 ? 's' : ''} op dit tarief zetten:
            </p>
            <div className="overflow-auto flex-1 space-y-1">
              {btwTarieven.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleZetBtwGeselecteerd(t.id)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-everts-50 hover:text-everts-dark transition-colors flex items-center gap-2"
                >
                  <span className="text-slate-400 text-[10px] w-10 shrink-0">{tariefKort(t)}</span>
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
              <button
                onClick={() => handleZetBtwGeselecteerd('')}
                className="w-full text-left text-xs px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              >
                — geen tarief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default CalculatieGrid
