'use client'

import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { AlertTriangle, Check, GripVertical, RotateCcw, Scissors, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'

import type { Medewerker, MedewerkerRooster } from '@everts/database/platform-types'
import { splitsPlanningItem, verplaatsPlanningItem, verwijderPlanningItem } from '@/app/(platform)/planning/actions'
import { crewKleur } from '@/lib/utils/crew'
import {
  DAG_MS, berekenConflicten, buitenRooster, clusterVoorConflict,
  type BlokInterval, type ConflictDetail, type EntryMetDossier, type Interval, type WerkInterval,
} from './conflict'
import ConflictRegelKaart from './ConflictRegelKaart'
import ConflictTijdlijn from './ConflictTijdlijn'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const LABEL_W = 96   // breedte van de naamkolom links van de tijdlijn
const LANE_H  = 40   // hoogte van één sleepbare baan
const SNAP_MS = 60 * 60 * 1000 // sleep-raster: 1 uur

// Zoomniveaus (zichtbare dagen). Krap inzoomen = meer pixels per uur, zodat je
// op het uur kunt slepen; uitzoomen om over meer dagen te verplaatsen.
const ZOOM_PRESETS = [
  { dagen: 1,  label: '1 dag' },
  { dagen: 2,  label: '2 dagen' },
  { dagen: 4,  label: '4 dagen' },
  { dagen: 7,  label: 'week' },
  { dagen: 14, label: '2 weken' },
] as const

type Wijziging = { id: string; start_dt: string; eind_dt: string }

type Venster = { vanMs: number; totMs: number; van: Date; tot: Date }

/** Afwijking t.o.v. het opgeslagen planitem. `uren` wijzigt alleen bij een splitsing. */
type Aanpassing = { start_dt: string; eind_dt: string; uren?: number }

/**
 * Een stuk dat bij het uitknippen van dubbele planning is overgebleven en bij "Toepassen"
 * een eigen planitem wordt. `bronId` is het item waaruit het komt (een bestaand planitem,
 * of — bij nogmaals knippen — een eerder overgebleven stuk). Eén knip kan meerdere stukken
 * opleveren; die delen dezelfde `knipId`, zodat "Samenvoegen" ze in één keer terugdraait.
 * `vorigeBron` bewaart hoe de bron erbij stond vóór de knip; `null` = op zijn opgeslagen tijd.
 */
type NieuwDeel = {
  tempId:     string
  bronId:     string
  knipId:     string
  start_dt:   string
  eind_dt:    string
  uren:       number
  vorigeBron: Aanpassing | null
}

const isTempId = (id: string) => id.startsWith('nieuw:')

/** Het bestaande planitem waar een (keten van) afgesplitste delen uit voortkomt. */
function wortelVan(bronId: string, delen: NieuwDeel[]): string {
  let id = bronId
  for (let stap = 0; stap < 20 && isTempId(id); stap++) {
    const ouder = delen.find(d => d.tempId === id)
    if (!ouder) break
    id = ouder.bronId
  }
  return id
}

/** Uren op twee decimalen; de som van beide delen blijft zo gelijk aan het origineel. */
const rondUren = (u: number) => Math.round(u * 100) / 100

type Props = {
  medewerker:     Medewerker
  conflict:       ConflictDetail
  /** Alle conflictsegmenten van deze medewerker (voor de cluster-bepaling). */
  conflicten:     ConflictDetail[]
  /** Alle (zichtbare) planitems van deze medewerker. */
  entriesRij:     EntryMetDossier[]
  blokken:        BlokInterval[]
  roosters:       MedewerkerRooster[]
  dossierMap:     Record<string, string>
  projectleiders: Record<string, { kleur: string | null; naam: string | null }>
  /** Zichtbare periode van de timeline — voor de "verschoven naar …"-melding. */
  zichtbaar:      { van: number; tot: number }
  /**
   * Succesvol opgeslagen wijzigingen (kan een deel zijn bij een fout halverwege),
   * plus de id's van de planitems die daadwerkelijk verwijderd zijn.
   */
  onApplied:      (wijzigingen: Wijziging[], verwijderd?: string[]) => void
  onClose:        () => void
}

export default function ConflictOplosDialog({
  medewerker, conflict, conflicten, entriesRij, blokken, roosters,
  dossierMap, projectleiders, zichtbaar, onApplied, onClose,
}: Props) {
  const [isPending, startTransition] = useTransition()
  // Draft: alleen afwijkingen t.o.v. het origineel; opslaan gebeurt pas bij "Toepassen".
  const [draft, setDraft] = useState<Record<string, Aanpassing>>({})
  // Als verwijderd gemarkeerde planitems — pas bij "Toepassen" gaan ze echt weg.
  const [teVerwijderen, setTeVerwijderen] = useState<string[]>([])
  // Delen die bij "Toepassen" als nieuw planitem worden weggeschreven (van een splitsing).
  const [nieuweDelen, setNieuweDelen] = useState<NieuwDeel[]>([])
  const verwijderdSet = useMemo(() => new Set(teVerwijderen), [teVerwijderen])

  const cluster = useMemo(() => clusterVoorConflict(conflict, conflicten), [conflict, conflicten])

  // De nieuwe delen als volwaardige entries: zo tellen ze mee in de conflictberekening,
  // krijgen ze een eigen baan op de tijdlijn en zijn ze net zo sleepbaar als de rest.
  const deelEntries = useMemo<EntryMetDossier[]>(
    () => nieuweDelen.flatMap(deel => {
      const basis = entriesRij.find(e => e.id === wortelVan(deel.bronId, nieuweDelen))
      if (!basis) return []
      return [{ ...basis, id: deel.tempId, start_dt: deel.start_dt, eind_dt: deel.eind_dt, uren: deel.uren }]
    }),
    [nieuweDelen, entriesRij],
  )

  // Alle rijen in dit venster: de conflictcluster plus wat er is afgesplitst.
  const rijen  = useMemo(() => [...cluster, ...deelEntries], [cluster, deelEntries])
  const rijIds = useMemo(() => new Set(rijen.map(e => e.id)), [rijen])

  const draftEntries = useMemo(
    () => [
      ...entriesRij.map(e => (draft[e.id] ? { ...e, ...draft[e.id] } : e)),
      ...deelEntries,
    ],
    [entriesRij, draft, deelEntries],
  )

  // Wat er ná de draft overblijft: verwijderde items tellen niet meer mee in de
  // conflictberekening, zodat de statusregel meteen laat zien dat de overlap weg is.
  const actieveEntries = useMemo(
    () => draftEntries.filter(e => !verwijderdSet.has(e.id)),
    [draftEntries, verwijderdSet],
  )

  const naarWork = (list: EntryMetDossier[]): WerkInterval[] =>
    list.map(e => ({ s: parseISO(e.start_dt).getTime(), e: parseISO(e.eind_dt).getTime(), entry: e }))

  const draftConflicten = useMemo(
    () => berekenConflicten(naarWork(actieveEntries), blokken),
    [actieveEntries, blokken],
  )

  const raaktCluster = (c: ConflictDetail) =>
    rijIds.has(c.a.id) || (c.soort === 'overlap' && rijIds.has(c.b.id))

  const resterend = draftConflicten.filter(raaktCluster)
  const opgelost  = resterend.length === 0
  // Een verwijderd item telt als één wijziging; een verschuiving eronder vervalt dan. Een
  // splitsing telt ook als één: de verschuiving van het oorspronkelijke item hoort erbij.
  const bronVanSplitsing = useMemo(() => new Set(nieuweDelen.map(d => d.bronId)), [nieuweDelen])
  const aantalWijzigingen =
    Object.keys(draft).filter(id => !verwijderdSet.has(id) && !bronVanSplitsing.has(id)).length
    + teVerwijderen.length + nieuweDelen.length

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const titelVan = (e: EntryMetDossier) => {
    const dossier = dossierMap[e.dossier_id ?? ''] ?? 'Onbekend dossier'
    const taak    = e.planning_activiteiten?.titel
    return taak && taak !== dossier ? `${dossier} — ${taak}` : dossier
  }
  const korteNaam = (e: EntryMetDossier) =>
    dossierMap[e.dossier_id ?? ''] ?? e.planning_activiteiten?.titel ?? 'planitem'
  const kleurVan = (e: EntryMetDossier) => {
    const pl = projectleiders[e.dossier_id ?? '']
    return pl?.kleur ?? crewKleur(pl?.naam ?? dossierMap[e.dossier_id ?? ''] ?? '—')
  }
  const fmt     = (ms: number) => format(new Date(ms), 'EEE d MMM HH:mm', { locale: nl })
  const fmtKort = (d: Date)    => format(d, 'EEE d MMM HH:mm', { locale: nl })

  const draftVan = (id: string) => draftEntries.find(e => e.id === id)!

  /** Nieuwe tijden voor een rij — een afgesplitst deel leeft in `nieuweDelen`, de rest in `draft`. */
  function zetTijden(id: string, start: Date, eind: Date) {
    const start_dt = start.toISOString()
    const eind_dt  = eind.toISOString()
    if (isTempId(id)) {
      setNieuweDelen(prev => prev.map(d => (d.tempId === id ? { ...d, start_dt, eind_dt } : d)))
      return
    }
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], start_dt, eind_dt } }))
  }

  /**
   * Markeer voor verwijdering; een eventuele verschuiving eronder heeft dan geen zin meer.
   * Was er van dit item iets afgeknipt, dan vervalt dat ook: het hele item gaat weg, dus
   * er is niets meer om los te plannen.
   */
  function markeerVerwijderen(id: string) {
    setTeVerwijderen(prev => (prev.includes(id) ? prev : [...prev, id]))
    setDraft(prev => { const rest = { ...prev }; delete rest[id]; return rest })
    setNieuweDelen(prev => prev.filter(deel => wortelVan(deel.bronId, prev) !== id))
  }
  function herstelVerwijderen(id: string) {
    setTeVerwijderen(prev => prev.filter(x => x !== id))
  }

  // ─── Splitsen ───────────────────────────────────────────────────────────────

  /**
   * Wat er van dit item overblijft als je alle dubbel geplande stukken eruit knipt: de
   * botsingen (met ander werk én met verlof/feestdag) samengevoegd tot aaneengesloten
   * blokken, en daartussen de stukken die wél vrij staan. Staat het hele item dubbel,
   * dan blijven er nul stukken over.
   */
  function knipPlan(id: string): { stukken: Interval[]; dubbelMs: number } | null {
    const d = draftVan(id)
    if (!d) return null
    const s = parseISO(d.start_dt).getTime()
    const e = parseISO(d.eind_dt).getTime()
    const botsingen = draftConflicten
      .filter(c => c.a.id === id || (c.soort === 'overlap' && c.b.id === id))
      .map(c => ({ s: Math.max(c.s, s), e: Math.min(c.e, e) }))
      .filter(c => c.s < c.e)
      .sort((x, y) => x.s - y.s)
    if (botsingen.length === 0) return null

    // Overlappende botsingen samenvoegen, anders knip je hetzelfde stuk twee keer weg.
    const samen: Interval[] = []
    for (const b of botsingen) {
      const laatste = samen[samen.length - 1]
      if (laatste && b.s <= laatste.e) laatste.e = Math.max(laatste.e, b.e)
      else samen.push({ ...b })
    }

    const stukken: Interval[] = []
    let cursor = s
    for (const b of samen) {
      if (b.s > cursor) stukken.push({ s: cursor, e: b.s })
      cursor = Math.max(cursor, b.e)
    }
    if (cursor < e) stukken.push({ s: cursor, e })

    const dubbelMs = samen.reduce((som, b) => som + (b.e - b.s), 0)
    return { stukken, dubbelMs }
  }

  /**
   * Knip het dubbel geplande stuk uit dit item. Wat vrij stond blijft exact staan — we
   * schuiven bewust niets door, want dan botst het item even vrolijk met de planning
   * erna. Ligt de botsing middenin, dan houdt het bestaande planitem het eerste stuk en
   * wordt elk volgend stuk een eigen planitem.
   *
   * De uren gaan naar rato van de duur mee met de stukken; de dubbel geplande uren
   * vervallen. Dat is de bedoeling: die uren kon de medewerker toch niet maken.
   */
  function splitsItem(id: string) {
    const d    = draftVan(id)
    const plan = knipPlan(id)
    if (!d || !plan || plan.stukken.length === 0) {
      toast.error('Dit item staat helemaal dubbel — verschuif of verwijder het.')
      return
    }
    const s = parseISO(d.start_dt).getTime()
    const e = parseISO(d.eind_dt).getTime()
    const urenVan = (stuk: Interval) => rondUren((d.uren * (stuk.e - stuk.s)) / (e - s))

    const [eerste, ...rest] = plan.stukken
    const knipId     = crypto.randomUUID()
    const vorigeBron = isTempId(id)
      ? { start_dt: d.start_dt, eind_dt: d.eind_dt, uren: d.uren }
      : draft[id] ?? null
    const eersteStaat: Aanpassing = {
      start_dt: new Date(eerste.s).toISOString(),
      eind_dt:  new Date(eerste.e).toISOString(),
      uren:     urenVan(eerste),
    }

    // Het bestaande planitem houdt het eerste stuk — en daarmee zijn werkbonnen,
    // geschreven uren en Bouw7-koppeling.
    if (isTempId(id)) {
      setNieuweDelen(prev => prev.map(deel => (deel.tempId === id
        ? { ...deel, ...eersteStaat, uren: eersteStaat.uren ?? deel.uren }
        : deel)))
    } else {
      setDraft(prev => ({ ...prev, [id]: eersteStaat }))
    }
    if (rest.length > 0) {
      setNieuweDelen(prev => [...prev, ...rest.map(stuk => ({
        tempId:   `nieuw:${crypto.randomUUID()}`,
        bronId:   id,
        knipId,
        start_dt: new Date(stuk.s).toISOString(),
        eind_dt:  new Date(stuk.e).toISOString(),
        uren:     urenVan(stuk),
        vorigeBron,
      }))])
    }

    const dubbeleUren = rondUren((d.uren * plan.dubbelMs) / (e - s))
    toast.success(`${dubbeleUren.toLocaleString('nl-NL')} uur dubbele planning eruit geknipt`)
  }

  /**
   * Knip terugdraaien: alle stukken van diezelfde knip vervallen en het item waar ze uit
   * komen gaat terug naar hoe het ervoor stond — inclusief de uren die eruit waren geknipt.
   */
  function herstelSplitsing(tempId: string) {
    const deel = nieuweDelen.find(d => d.tempId === tempId)
    if (!deel) return
    setNieuweDelen(prev => prev.filter(d => d.knipId !== deel.knipId))
    if (isTempId(deel.bronId)) {
      if (!deel.vorigeBron) return
      const terug = deel.vorigeBron
      setNieuweDelen(prev => prev.map(d => (d.tempId === deel.bronId
        ? { ...d, start_dt: terug.start_dt, eind_dt: terug.eind_dt, uren: terug.uren ?? d.uren }
        : d)))
      return
    }
    setDraft(prev => {
      const rest = { ...prev }
      if (deel.vorigeBron) rest[deel.bronId] = deel.vorigeBron
      else delete rest[deel.bronId]
      return rest
    })
  }

  /** Rij terug naar de opgeslagen stand; wat eruit geknipt was komt er dus weer bij. */
  function herstelRij(id: string) {
    setDraft(prev => { const rest = { ...prev }; delete rest[id]; return rest })
    setNieuweDelen(prev => prev.filter(deel => wortelVan(deel.bronId, prev) !== id))
  }

  // ─── Sleepbare tijdlijn ─────────────────────────────────────────────────────

  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef  = useRef<
    { id: string; startX: number; origStartMs: number; durMs: number; venster: Venster } | null
  >(null)
  const [sleeptId, setSleeptId] = useState<string | null>(null)
  // Tijdens het slepen bevriezen we het venster zodat de balken niet mee-herschalen
  // (dat zou de balk onder de cursor laten wegdrijven).
  const [vastVenster, setVastVenster] = useState<Venster | null>(null)

  // Bereik dat de rijen (origineel + draft + afgesplitste delen) samen beslaan.
  const clusterRange = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (const e of rijen) {
      const d = draftVan(e.id) ?? e
      lo = Math.min(lo, parseISO(e.start_dt).getTime(), parseISO(d.start_dt).getTime())
      hi = Math.max(hi, parseISO(e.eind_dt).getTime(), parseISO(d.eind_dt).getTime())
    }
    return { lo, hi }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rijen, draftEntries])

  // Aantal hele dagen dat de rijen minimaal beslaan — ondergrens voor inzoomen
  // (je kunt niet krapper dan de betrokken planningen zelf).
  const fitDagen = Math.max(
    1,
    Math.round(
      (addDays(startOfDay(new Date(clusterRange.hi - 1)), 1).getTime()
        - startOfDay(new Date(clusterRange.lo)).getTime()) / DAG_MS,
    ),
  )

  // Zoomniveau: standaard krap (op-het-uur slepen), uit te zoomen via de knoppen.
  const [zoomDagen, setZoomDagen] = useState<number>(() => {
    let lo = Infinity, hi = -Infinity
    for (const e of cluster) {
      lo = Math.min(lo, parseISO(e.start_dt).getTime())
      hi = Math.max(hi, parseISO(e.eind_dt).getTime())
    }
    const dagen = Math.max(1, Math.ceil((hi - lo) / DAG_MS))
    return Math.min(14, Math.max(2, dagen + 1))
  })

  const venster = useMemo<Venster>(() => {
    if (vastVenster) return vastVenster
    const vanFit = startOfDay(new Date(clusterRange.lo))
    const totFit = addDays(startOfDay(new Date(clusterRange.hi - 1)), 1)
    const totaal = Math.max(fitDagen, zoomDagen)
    const extra  = totaal - fitDagen
    const van = addDays(vanFit, -Math.floor(extra / 2))
    const tot = addDays(totFit, Math.ceil(extra / 2))
    return { vanMs: van.getTime(), totMs: tot.getTime(), van, tot }
  }, [clusterRange, fitDagen, zoomDagen, vastVenster])

  const dagenVenster = useMemo(
    () => eachDayOfInterval({ start: venster.van, end: addDays(venster.tot, -1) }),
    [venster],
  )
  const spanMs = venster.totMs - venster.vanMs
  const pct    = (ms: number) => ((ms - venster.vanMs) / spanMs) * 100
  const labelElke = Math.max(1, Math.ceil(dagenVenster.length / 10))
  const zichtbareDagen = Math.round(spanMs / DAG_MS)

  // Uurlijnen als hulp bij op-het-uur slepen — alleen als er genoeg ruimte per uur is.
  const uurLijnen = useMemo(() => {
    if (zichtbareDagen > 3) return [] as number[]
    const stapUur = zichtbareDagen <= 1 ? 2 : 3
    const lijnen: number[] = []
    for (let t = venster.vanMs; t < venster.totMs; t += stapUur * 60 * 60 * 1000) {
      if (new Date(t).getHours() !== 0) lijnen.push(t) // middernacht = daglijn
    }
    return lijnen
  }, [venster, zichtbareDagen])

  function barPointerDown(e: React.PointerEvent, entry: EntryMetDossier) {
    if (!stripRef.current) return
    const d = draftVan(entry.id)
    const origStartMs = parseISO(d.start_dt).getTime()
    const durMs       = parseISO(d.eind_dt).getTime() - origStartMs
    setVastVenster(venster)
    dragRef.current = { id: entry.id, startX: e.clientX, origStartMs, durMs, venster }
    setSleeptId(entry.id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }

  function barPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const rect = stripRef.current?.getBoundingClientRect()
    if (!drag || !rect) return
    const vspan   = drag.venster.totMs - drag.venster.vanMs
    const deltaMs = ((e.clientX - drag.startX) / rect.width) * vspan
    const snapped = Math.round(deltaMs / SNAP_MS) * SNAP_MS
    // Binnen het (bevroren) venster houden zodat de balk zichtbaar blijft.
    const maxStart = Math.max(drag.venster.vanMs, drag.venster.totMs - drag.durMs)
    const newStart = Math.max(drag.venster.vanMs, Math.min(drag.origStartMs + snapped, maxStart))
    zetTijden(drag.id, new Date(newStart), new Date(newStart + drag.durMs))
  }

  function barPointerUp() {
    if (!dragRef.current) return
    dragRef.current = null
    setSleeptId(null)
    setVastVenster(null)
  }

  // Context: werk-taken buiten dit venster die in beeld vallen (om per ongeluk
  // erbovenop slepen zichtbaar te maken).
  const contextWerk = actieveEntries.filter(
    e => !rijIds.has(e.id)
      && parseISO(e.eind_dt).getTime() > venster.vanMs
      && parseISO(e.start_dt).getTime() < venster.totMs,
  )

  // ─── Opslaan ────────────────────────────────────────────────────────────────

  // Geen extra bevestigvraag: het markeren (rode kaart) en daarna pas "Toepassen" ís de
  // bevestiging. Een genest AlertDialog zou bovendien achter dit venster vallen (z-index).
  function handleToepassen() {
    startTransition(async () => {
      const verwijderdOk: string[] = []
      // Eerst de verwijderingen: die maken vaak juist de ruimte vrij waar de
      // verschuivingen hieronder in moeten passen.
      for (const id of teVerwijderen) {
        const e = entriesRij.find(x => x.id === id)
        const result = await verwijderPlanningItem(id)
        if (!result.ok) {
          toast.error(`${e ? korteNaam(e) : 'Planitem'}: ${result.error}`)
          if (verwijderdOk.length > 0) {
            onApplied([], verwijderdOk)
            setTeVerwijderen(prev => prev.filter(x => !verwijderdOk.includes(x)))
          }
          return
        }
        verwijderdOk.push(id)
      }

      // Dan de splitsingen. Op volgorde van knippen, zodat een deel dat uit een eerder
      // afgesplitst deel komt pas aan de beurt is als dat deel een echt id heeft.
      const echtId = new Map<string, string>()
      const gesplitst: string[] = []
      for (const deel of nieuweDelen) {
        const bronId = echtId.get(deel.bronId) ?? deel.bronId
        const bron   = draftVan(deel.bronId)
        if (isTempId(bronId) || !bron) continue // bron is niet weggeschreven; deel vervalt
        const result = await splitsPlanningItem(bronId, {
          deel1: { start_dt: bron.start_dt, eind_dt: bron.eind_dt, uren: bron.uren },
          deel2: { start_dt: deel.start_dt, eind_dt: deel.eind_dt, uren: deel.uren },
        })
        if (!result.ok) {
          toast.error(`${korteNaam(draftVan(deel.tempId) ?? bron)}: ${result.error}`)
          onApplied([], verwijderdOk)
          onClose()
          return
        }
        echtId.set(deel.tempId, result.nieuwId)
        gesplitst.push(bronId)
      }

      const toegepast: Wijziging[] = []
      for (const [id, w] of Object.entries(draft)) {
        const e = entriesRij.find(x => x.id === id)
        // Een gesplitst item heeft zijn nieuwe tijden al van splitsPlanningItem gekregen.
        if (!e || verwijderdSet.has(id) || gesplitst.includes(id)) continue
        const result = await verplaatsPlanningItem(id, {
          start_dt:    w.start_dt,
          eind_dt:     w.eind_dt,
          dossier_id:  e.dossier_id ?? '',
          uursoort_id: e.planning_activiteiten?.uursoort_id ?? null,
          // Na een knip zonder reststuk staan de nieuwe uren in de draft; anders blijven
          // de uren van het item zelf staan.
          uren:        w.uren ?? e.uren,
        })
        if (!result.ok) {
          toast.error(`${korteNaam(e)}: ${result.error}`)
          if (toegepast.length > 0 || verwijderdOk.length > 0) {
            // Deels opgeslagen: parent bijwerken, rest van de draft blijft staan.
            onApplied(toegepast, verwijderdOk)
            setTeVerwijderen([])
            setDraft(prev => {
              const rest = { ...prev }
              for (const t of toegepast) delete rest[t.id]
              return rest
            })
          }
          return
        }
        toegepast.push({ id, start_dt: w.start_dt, eind_dt: w.eind_dt })
      }

      // Item(s) buiten de zichtbare periode verschoven? Meld waarheen.
      const buitenBeeld = toegepast.filter(t => {
        const s = parseISO(t.start_dt).getTime()
        return s < zichtbaar.van || s >= zichtbaar.tot
      })
      if (buitenBeeld.length > 0) {
        const e = entriesRij.find(x => x.id === buitenBeeld[0].id)
        toast.success(`${opgelost ? 'Conflict opgelost' : 'Planning aangepast'} — “${e ? korteNaam(e) : 'planitem'}” staat nu op ${fmtKort(parseISO(buitenBeeld[0].start_dt))} (buiten beeld)`)
      } else if (echtId.size > 0) {
        toast.success(opgelost
          ? `Conflict opgelost — ${echtId.size === 1 ? 'het losse deel staat' : 'de losse delen staan'} apart ingepland`
          : 'Planning aangepast')
      } else if (verwijderdOk.length > 0 && toegepast.length === 0) {
        toast.success(
          verwijderdOk.length === 1
            ? 'Planitem verwijderd'
            : `${verwijderdOk.length} planitems verwijderd`,
        )
      } else {
        toast.success(opgelost ? 'Conflict opgelost' : 'Planning aangepast')
      }
      onApplied(toegepast, verwijderdOk)
      onClose()
    })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const naam = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 'min(640px, calc(100vw - 32px))',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                Conflict oplossen — {naam}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {conflict.soort === 'overlap' ? (
                <><strong>{titelVan(conflict.a)}</strong> overlapt met <strong>{titelVan(conflict.b)}</strong></>
              ) : (
                <><strong>{titelVan(conflict.a)}</strong> valt tijdens <strong>{conflict.blokLabel}</strong></>
              )}
              {' · '}{fmt(conflict.s)} – {fmt(conflict.e)}
              {cluster.length > 2 && <> · Dit conflict raakt {cluster.length} planitems.</>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sleepbare tijdlijn */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Sleep een balk om de overlap op te heffen</label>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
                {ZOOM_PRESETS.map(z => {
                  const disabled = z.dagen < fitDagen
                  const actief   = !disabled && Math.max(fitDagen, zoomDagen) === z.dagen
                  return (
                    <button
                      key={z.dagen}
                      type="button"
                      disabled={disabled}
                      onClick={() => setZoomDagen(z.dagen)}
                      title={disabled ? 'De betrokken planning past niet in deze weergave' : `Toon ${z.label}`}
                      style={{
                        padding: '2px 8px', borderRadius: 4, border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        background: actief ? 'var(--accent)' : 'transparent',
                        color: actief ? 'white' : 'var(--fg-muted)',
                        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {z.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <ConflictTijdlijn
              rijen={rijen}
              draftVan={draftVan}
              verwijderdSet={verwijderdSet}
              contextWerk={contextWerk}
              blokken={blokken}
              roosters={roosters}
              resterend={resterend}
              venster={venster}
              dagenVenster={dagenVenster}
              uurLijnen={uurLijnen}
              spanMs={spanMs}
              labelElke={labelElke}
              pct={pct}
              titelVan={titelVan}
              korteNaam={korteNaam}
              kleurVan={kleurVan}
              fmt={fmt}
              sleeptId={sleeptId}
              stripRef={stripRef}
              barPointerDown={barPointerDown}
              barPointerMove={barPointerMove}
              barPointerUp={barPointerUp}
            />

            {/* Statusregel */}
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700,
              color: opgelost ? '#15803d' : '#b91c1c',
            }}>
              {opgelost
                ? <><Check size={13} /> Geen overlap meer</>
                : <><AlertTriangle size={13} /> Nog {resterend.length} conflict{resterend.length === 1 ? '' : 'en'}</>}
            </div>
          </div>

          {/* Handmatig verschuiven of verwijderen per planitem — precieze tijden en grote sprongen */}
          <div>
            <label style={labelStyle}>Verschuiven, splitsen of verwijderen</label>
            {/* Verlof, ziekte, ATV en feestdagen staan hier bewust niet tussen: die komen uit de
                verlofadministratie en zijn in dit venster alleen de rode banen op de tijdlijn. */}
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: -2, marginBottom: 6 }}>
              Splitsen knipt het dubbel geplande stuk eruit en laat de rest staan; die uren vervallen.
              Verlof en feestdagen horen bij de verlofadministratie en zijn hier niet te wijzigen.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rijen.map(rij => {
                const d         = draftVan(rij.id)
                const isDeel    = isTempId(rij.id)
                const weg       = verwijderdSet.has(rij.id)
                const knip      = weg ? null : knipPlan(rij.id)
                // Een deel waar zelf weer iets van is afgeknipt kan niet terug: dan zou het
                // kind zonder bron achterblijven. Eerst dat kind ongedaan maken.
                const heeftKind = nieuweDelen.some(deel => deel.bronId === rij.id)
                // Wat er echt vervallen is: het origineel min wat dit item houdt en min de
                // uren die naar de reststukken zijn gegaan. Anders tel je die dubbel als verlies.
                const urenInStukken = nieuweDelen
                  .filter(deel => deel.bronId === rij.id)
                  .reduce((som, deel) => som + deel.uren, 0)
                return (
                  <ConflictRegelKaart
                    key={rij.id}
                    rij={rij}
                    d={d}
                    isDeel={isDeel}
                    gewijzigd={!isDeel && !!draft[rij.id]}
                    weg={weg}
                    heeftKind={heeftKind}
                    kanSplitsen={!!knip && knip.stukken.length > 0}
                    geknipteUren={rondUren(rij.uren - d.uren - urenInStukken)}
                    titel={titelVan(rij)}
                    kleur={kleurVan(rij)}
                    zetTijden={zetTijden}
                    splits={splitsItem}
                    herstelRij={herstelRij}
                    herstelSplitsing={herstelSplitsing}
                    markeerVerwijderen={markeerVerwijderen}
                    herstelVerwijderen={herstelVerwijderen}
                  />
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} className="eva-btn-ghost">Annuleren</button>
            <button
              type="button"
              onClick={handleToepassen}
              disabled={isPending || aantalWijzigingen === 0}
              className="eva-btn-primary"
            >
              {isPending
                ? 'Bezig…'
                : `Toepassen${aantalWijzigingen > 0 ? ` (${aantalWijzigingen} wijziging${aantalWijzigingen === 1 ? '' : 'en'})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
