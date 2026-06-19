/**
 * Gedeelde management-aggregaties.
 *
 * Eén bron voor de cijferberekeningen die zowel het *live* dashboard als de
 * *vastgestelde* maandsnapshot gebruiken. Geen React/'use client' hier — puur
 * data, zodat het ook in server actions en query's bruikbaar is.
 */

/* ════════════════════════════════════════════════════════════════════
 * Types — management_projecten
 * ════════════════════════════════════════════════════════════════════ */

export type ManagementProject = {
  id: string
  projectnummer: string
  bouw7_id: string | null
  filiaal: string | null
  status: string | null
  opdrachtgever: string | null
  projectnaam: string
  categorie: string | null
  projectleider: string | null
  geboekte_kosten: number | null
  totale_opdracht: number | null
  pct_gereed: number | null
  totale_prognose: number | null
  verwacht_resultaat: number | null
  pct_marge: number | null
  omzet_obv_pct: number | null
  resultaat_obv_pct: number | null
  gefactureerd: number | null
  resultaat_gereed: number | null
  pct_marge_gereed: number | null
  verschil_pct_marge: number | null
  is_gereed: boolean
  kosten_split: Record<string, number> | null
  dossier_id: string | null
  dossier_sectie: string | null
  bouw7_laatst_sync: string | null
  /** OHW-correctie (handmatig per dossier): omzet/resultaat dat aan het vórige
   *  boekjaar toebehoort. Wordt afgetrokken van de Gerealiseerd-cijfers. */
  ohw_omzet?: number | null
  ohw_resultaat?: number | null
}

export type ManagementOhw = {
  id: string
  boekjaar: number
  bouw7_id: string
  projectnummer: string | null
  projectnaam: string | null
  filiaal: string | null
  omzet_vorig_boekjaar: number | null
  resultaat_vorig_boekjaar: number | null
  opmerkingen: string | null
}

export type ManagementAK = {
  id: string
  jaar: number
  filiaal: string
  bedrag_ak: number
  opmerkingen: string | null
}

export type ManagementDoelstelling = {
  id: string
  jaar: number
  filiaal: string | null
  projectleider: string | null
  omzet_doelstelling: number | null
  resultaat_doelstelling: number | null
}

/* ════════════════════════════════════════════════════════════════════
 * Formatters (pure)
 * ════════════════════════════════════════════════════════════════════ */

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function fEur(v: number | null | undefined): string {
  if (v == null) return '—'
  return eurFmt.format(v)
}

export function fEurK(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `€${Math.round(v / 1_000)}K`
  return eurFmt.format(v)
}

export function fPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

/* ── Gedeelde tabel-/tone-helpers (pure strings, voor alle management-views) ── */

export const pvTh = 'px-[10px] py-[7px] bg-neutral-50 border-b-2 border-neutral-200 text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-500 text-right whitespace-nowrap'
export const pvTd = 'px-[10px] py-[8px] border-b border-neutral-100 align-middle whitespace-nowrap text-[12px] text-neutral-900'

export function dekkingTone(v: number | null): 'success' | 'warning' | 'error' | 'info' {
  if (v == null) return 'info'
  if (v >= 80) return 'success'
  if (v >= 50) return 'warning'
  return 'error'
}

export function margeTone(v: number | null | undefined): string {
  if (v == null) return 'text-neutral-400'
  if (v < 0)    return 'text-error-500 font-semibold'
  if (v < 10)   return 'text-warning-700 font-semibold'
  return 'text-success-700 font-semibold'
}

export function resultaatClass(v: number | null | undefined): string {
  if (v == null) return 'text-neutral-400'
  return v < 0 ? 'text-error-500 font-semibold' : 'text-success-700 font-semibold'
}

const FILIAAL_KORT: Record<string, string> = {
  'Bouwbedrijf Morgenstond B.V.': 'BBM',
  'Everts Onderhoudsschilders B.V.': 'EOS',
  'Dakdekkersbedrijf Dakplan B.V.': 'DP',
}

export function kortFiliaal(filiaal: string | null | undefined): string {
  if (!filiaal) return '?'
  return FILIAAL_KORT[filiaal] ?? filiaal.slice(0, 6)
}

/** Korte PL-naam voor grafiekassen: voornaam + 1e letter achternaam. */
export function kortNaam(naam: string | null | undefined): string {
  if (!naam) return 'Onbekend'
  const delen = naam.trim().split(/\s+/)
  if (delen.length === 1) return delen[0]
  return `${delen[0]} ${delen[delen.length - 1][0]}.`
}

/** Dashboard toont alleen echte werken: géén offerte/afgewezen-statussen (01./08./09.). */
export function isDashboardStatus(status: string | null | undefined): boolean {
  return !/^(01|08|09)\./.test(status ?? '')
}

/* ════════════════════════════════════════════════════════════════════
 * Pivot helpers — werkmaatschappij / status / projectleider
 * ════════════════════════════════════════════════════════════════════ */

export type PivotAgg = {
  aantal: number
  omzetOpdracht: number
  omzetGerealiseerd: number
  resultaatOpdracht: number
  resultaatGerealiseerd: number
}

export function leegAgg(): PivotAgg {
  return { aantal: 0, omzetOpdracht: 0, omzetGerealiseerd: 0, resultaatOpdracht: 0, resultaatGerealiseerd: 0 }
}

function tel(d: PivotAgg, p: ManagementProject) {
  d.aantal++
  if (p.is_gereed) {
    // Gereed telt mee in zowel In opdracht als Gerealiseerd (anders klopt het totaal niet).
    d.omzetOpdracht         += p.gefactureerd     ?? 0
    d.omzetGerealiseerd     += p.gefactureerd     ?? 0
    d.resultaatOpdracht     += p.resultaat_gereed ?? 0
    d.resultaatGerealiseerd += p.resultaat_gereed ?? 0
  } else {
    d.omzetOpdracht         += p.totale_opdracht    ?? 0
    d.omzetGerealiseerd     += p.omzet_obv_pct      ?? 0
    d.resultaatOpdracht     += p.verwacht_resultaat ?? 0
    d.resultaatGerealiseerd += p.resultaat_obv_pct  ?? 0
  }
  // OHW-correctie: trek het aan het vórige boekjaar toegewezen deel af van de
  // Gerealiseerd-cijfers (In opdracht blijft de volledige opdrachtwaarde).
  d.omzetGerealiseerd     -= p.ohw_omzet     ?? 0
  d.resultaatGerealiseerd -= p.ohw_resultaat ?? 0
}

export function optellen(a: PivotAgg, b: PivotAgg): PivotAgg {
  return {
    aantal:                a.aantal + b.aantal,
    omzetOpdracht:         a.omzetOpdracht + b.omzetOpdracht,
    omzetGerealiseerd:     a.omzetGerealiseerd + b.omzetGerealiseerd,
    resultaatOpdracht:     a.resultaatOpdracht + b.resultaatOpdracht,
    resultaatGerealiseerd: a.resultaatGerealiseerd + b.resultaatGerealiseerd,
  }
}

/** Dekking status = gerealiseerde marge (resultaat / omzet), val terug op in-opdracht. */
export function dekkingMarge(a: PivotAgg): number | null {
  const teller = a.resultaatGerealiseerd || a.resultaatOpdracht
  const noemer = a.omzetGerealiseerd || a.omzetOpdracht
  if (!noemer) return null
  return (teller / noemer) * 100
}

/** Best-effort sorteervolgorde van statuslabels (Bouw7 status.name). */
function statusOrde(s: string): number {
  const t = s.toLowerCase()
  if (t.includes('voorbereiding') || t.includes('nieuwe')) return 1
  if (t.includes('onderhanden'))                            return 2
  if (t.includes('uitvoering'))                             return 3
  if (t.includes('technisch'))                              return 4
  if (t.includes('financ'))                                 return 5
  if (t.includes('afge') || t.includes('vervall') || t.includes('ingetrok')) return 9
  return 6
}

export type FilGroep = {
  filiaal: string
  totaal: PivotAgg
  statussen: { status: string; agg: PivotAgg }[]
}

export function buildHierarchie(projecten: ManagementProject[]): FilGroep[] {
  const map = new Map<string, { totaal: PivotAgg; statusMap: Map<string, PivotAgg> }>()
  for (const p of projecten) {
    const fil = p.filiaal ?? 'Overig'
    if (!map.has(fil)) map.set(fil, { totaal: leegAgg(), statusMap: new Map() })
    const g = map.get(fil)!
    tel(g.totaal, p)
    const st = p.status ?? 'Onbekend'
    if (!g.statusMap.has(st)) g.statusMap.set(st, leegAgg())
    tel(g.statusMap.get(st)!, p)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([filiaal, g]) => ({
      filiaal,
      totaal: g.totaal,
      statussen: [...g.statusMap.entries()]
        .sort((a, b) => statusOrde(a[0]) - statusOrde(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, agg]) => ({ status, agg })),
    }))
}

/** Doelstelling op werkmaatschappij-niveau (projectleider leeg). */
export function doelVoorFiliaal(doelstellingen: ManagementDoelstelling[], filiaal: string): ManagementDoelstelling | undefined {
  return doelstellingen
    .filter(d => d.filiaal === filiaal && !d.projectleider)
    .sort((a, b) => b.jaar - a.jaar)[0]
}

export type PLPivot = {
  projectleider: string
  aantalLopend: number
  aantalGereed: number
  omzetOpdracht: number
  omzetGerealiseerd: number
  resultaatOpdracht: number
  resultaatGerealiseerd: number
}

export function buildPivotPL(projecten: ManagementProject[]): PLPivot[] {
  const map = new Map<string, PLPivot>()
  for (const p of projecten) {
    const pl = p.projectleider ?? 'Onbekend'
    if (!map.has(pl)) map.set(pl, {
      projectleider: pl, aantalLopend: 0, aantalGereed: 0,
      omzetOpdracht: 0, omzetGerealiseerd: 0, resultaatOpdracht: 0, resultaatGerealiseerd: 0,
    })
    const d = map.get(pl)!
    if (p.is_gereed) {
      d.aantalGereed++
      d.omzetOpdracht         += p.gefactureerd     ?? 0
      d.omzetGerealiseerd     += p.gefactureerd     ?? 0
      d.resultaatOpdracht     += p.resultaat_gereed ?? 0
      d.resultaatGerealiseerd += p.resultaat_gereed ?? 0
    } else {
      d.aantalLopend++
      d.omzetOpdracht         += p.totale_opdracht    ?? 0
      d.omzetGerealiseerd     += p.omzet_obv_pct      ?? 0
      d.resultaatOpdracht     += p.verwacht_resultaat ?? 0
      d.resultaatGerealiseerd += p.resultaat_obv_pct  ?? 0
    }
    // OHW-correctie: trek vorig-boekjaar-deel af van de Gerealiseerd-cijfers.
    d.omzetGerealiseerd     -= p.ohw_omzet     ?? 0
    d.resultaatGerealiseerd -= p.ohw_resultaat ?? 0
  }
  return [...map.values()].sort((a, b) =>
    (b.omzetOpdracht + b.omzetGerealiseerd) - (a.omzetOpdracht + a.omzetGerealiseerd),
  )
}

/** Meest recente doelstelling voor een projectleider (over alle jaren). */
export function doelVoorPL(doelstellingen: ManagementDoelstelling[], pl: string): ManagementDoelstelling | undefined {
  return doelstellingen
    .filter(d => d.projectleider === pl)
    .sort((a, b) => b.jaar - a.jaar)[0]
}

/* ════════════════════════════════════════════════════════════════════
 * Volledige KPI-bundel (drijft DashboardView, live én snapshot)
 * ════════════════════════════════════════════════════════════════════ */

export type ManagementKpi = {
  totaalProjecten: number
  aantalLopend: number
  aantalGereed: number
  totaalResultaatGerealiseerd: number
  totaalResultaatOpdracht: number
  totaalAK: number
  akDekkingGerealiseerd: number | null
  akDekkingOpdracht: number | null
  hierarchie: FilGroep[]
  plPivot: PLPivot[]
  jaarresultaatData: { name: string; Realisatie: number; 'In opdracht': number; 'Nog binnen halen': number }[]
  plResultaatData: { name: string; Gerealiseerd: number; 'In opdracht': number; Doelstelling?: number }[]
  opdrachtgevers: { naam: string; omzet: number; resultaat: number; marge: number }[]
  categorieData: { name: string; value: number }[]
  kostensoortData: { name: string; value: number }[]
  /** OHW-correctie per werkmaatschappij: bedragen toegewezen aan het vórige
   *  boekjaar (al in mindering gebracht op de Gerealiseerd-cijfers). */
  ohwPerFiliaal: { filiaal: string; omzet: number; resultaat: number }[]
  ohwTotaal: { omzet: number; resultaat: number }
  /** Relevante doelstellingen (meegekopieerd zodat pivot-tabellen ook uit een snapshot werken). */
  doelstellingen: ManagementDoelstelling[]
}

export function berekenManagementKpi(
  projecten: ManagementProject[],
  akData: ManagementAK[],
  doelstellingen: ManagementDoelstelling[],
): ManagementKpi {
  // Dashboard-aggregaties: offerte/afgewezen-statussen (01./08./09.) tellen niet mee.
  const dash = projecten.filter(p => isDashboardStatus(p.status))

  const hierarchie = buildHierarchie(dash)
  const plPivot    = buildPivotPL(dash)

  // Filiaal-totaal afgeleid uit de hiërarchie (zelfde cijfers als de pivot).
  const filTotalen = hierarchie.map(g => ({ filiaal: g.filiaal, t: g.totaal }))

  const totaalResultaatGerealiseerd = filTotalen.reduce((s, f) => s + f.t.resultaatGerealiseerd, 0)
  const totaalResultaatOpdracht     = filTotalen.reduce((s, f) => s + f.t.resultaatOpdracht, 0)
  const totaalAK                    = akData.reduce((s, a) => s + (a.bedrag_ak ?? 0), 0)

  const akDekkingGerealiseerd = totaalAK > 0 ? (totaalResultaatGerealiseerd / totaalAK) * 100 : null
  const akDekkingOpdracht     = totaalAK > 0 ? (totaalResultaatOpdracht     / totaalAK) * 100 : null

  const jaarresultaatData = filTotalen.map(({ filiaal, t }) => {
    const doel    = doelVoorFiliaal(doelstellingen, filiaal)
    const doelRes = doel?.resultaat_doelstelling ?? 0
    const real        = t.resultaatGerealiseerd
    const opdrachtRest = Math.max(0, t.resultaatOpdracht - real)
    const nogBinnen   = Math.max(0, doelRes - real - opdrachtRest)
    return {
      name: kortFiliaal(filiaal),
      'Realisatie':       Math.round(real / 1000),
      'In opdracht':      Math.round(opdrachtRest / 1000),
      'Nog binnen halen': Math.round(nogBinnen / 1000),
    }
  })

  const plResultaatData = plPivot.map(pl => {
    const doel = doelVoorPL(doelstellingen, pl.projectleider)
    return {
      name: kortNaam(pl.projectleider),
      'Gerealiseerd': Math.round(pl.resultaatGerealiseerd / 1000),
      'In opdracht':  Math.round(pl.resultaatOpdracht     / 1000),
      'Doelstelling': doel?.resultaat_doelstelling != null ? Math.round(doel.resultaat_doelstelling / 1000) : undefined,
    }
  })

  const ogMap = new Map<string, { omzet: number; resultaat: number }>()
  for (const p of dash) {
    const og = p.opdrachtgever ?? 'Onbekend'
    if (!ogMap.has(og)) ogMap.set(og, { omzet: 0, resultaat: 0 })
    const d = ogMap.get(og)!
    if (p.is_gereed) {
      d.omzet     += p.gefactureerd     ?? 0
      d.resultaat += p.resultaat_gereed ?? 0
    } else {
      d.omzet     += p.totale_opdracht    ?? 0
      d.resultaat += p.verwacht_resultaat ?? 0
    }
  }
  const opdrachtgevers = [...ogMap.entries()]
    .map(([naam, v]) => ({ naam, ...v, marge: v.omzet > 0 ? (v.resultaat / v.omzet) * 100 : 0 }))
    .sort((a, b) => b.omzet - a.omzet)
    .slice(0, 15)

  const catMap = new Map<string, number>()
  for (const p of dash) {
    const cat = p.categorie ?? 'Overig'
    catMap.set(cat, (catMap.get(cat) ?? 0) + ((p.is_gereed ? p.gefactureerd : p.totale_opdracht) ?? 0))
  }
  const categorieData = [...catMap.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)

  const ksLabels: Record<string, string> = {
    lonen: 'Lonen', onderaanneming: 'Onderaanneming', materiaal: 'Materiaal',
    materieel: 'Materieel', inkoop: 'Inkoop', overig: 'Overig',
  }
  const ksAcc: Record<string, number> = {}
  for (const p of dash) {
    if (!p.kosten_split) continue
    for (const [k, v] of Object.entries(p.kosten_split)) ksAcc[k] = (ksAcc[k] ?? 0) + (v ?? 0)
  }
  const kostensoortData = Object.entries(ksAcc)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: ksLabels[k] ?? k, value: Math.round(v) }))
    .sort((a, b) => b.value - a.value)

  // OHW-correctie per werkmaatschappij (toegewezen aan vorig boekjaar).
  const ohwMap = new Map<string, { omzet: number; resultaat: number }>()
  for (const p of dash) {
    const o = p.ohw_omzet ?? 0, r = p.ohw_resultaat ?? 0
    if (!o && !r) continue
    const fil = p.filiaal ?? 'Overig'
    const cur = ohwMap.get(fil) ?? { omzet: 0, resultaat: 0 }
    cur.omzet += o; cur.resultaat += r
    ohwMap.set(fil, cur)
  }
  const ohwPerFiliaal = [...ohwMap.entries()]
    .map(([filiaal, v]) => ({ filiaal, ...v }))
    .sort((a, b) => a.filiaal.localeCompare(b.filiaal))
  const ohwTotaal = ohwPerFiliaal.reduce(
    (s, f) => ({ omzet: s.omzet + f.omzet, resultaat: s.resultaat + f.resultaat }),
    { omzet: 0, resultaat: 0 },
  )

  return {
    totaalProjecten: dash.length,
    aantalLopend: dash.filter(p => !p.is_gereed).length,
    aantalGereed: dash.filter(p =>  p.is_gereed).length,
    totaalResultaatGerealiseerd,
    totaalResultaatOpdracht,
    totaalAK,
    akDekkingGerealiseerd,
    akDekkingOpdracht,
    hierarchie,
    plPivot,
    jaarresultaatData,
    plResultaatData,
    opdrachtgevers,
    categorieData,
    kostensoortData,
    ohwPerFiliaal,
    ohwTotaal,
    doelstellingen,
  }
}

/* ════════════════════════════════════════════════════════════════════
 * Vastgestelde maandsnapshot
 * ════════════════════════════════════════════════════════════════════ */

export type MaandSnapshotSamenvatting = {
  id: string
  periode: string                 // 'YYYY-MM-DD' (eerste dag vd maand)
  vastgesteld_door_naam: string | null
  vastgesteld_op: string
  opmerking: string | null
  kpi: ManagementKpi
}

export type MaandSnapshot = MaandSnapshotSamenvatting & {
  funnel: FunnelData | null
  calculators: CalculatorStat[] | null
}

/* ════════════════════════════════════════════════════════════════════
 * Verkoop / funnel — aanvraag → offerte → opdracht
 *
 * Belangrijk: win/verlies wordt afgeleid uit de *huidige* dossierstatus,
 * niet uit dossier_status_historie. De meeste opdrachten komen rechtstreeks
 * uit Bouw7 binnen (geen in-app "gewonnen"-overgang), dus de historie telt
 * winst zwaar onder. created_at (instroom) en verzonden_op (offerte verstuurd)
 * zijn de betrouwbare tijdstempels voor trend/doorlooptijd.
 * ════════════════════════════════════════════════════════════════════ */

export type FunnelDossier = {
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  bedrag_excl_btw: number | null
  categorie: string | null
  bouw7_filiaal: string | null
  calculator_id: string | null
  created_at: string | null
  verzonden_op: string | null
}

export type FunnelTelling = { aantal: number; waarde: number }

export type FunnelDimRij = {
  label: string
  offertes: number        // bereikte minimaal offerte-fase (offerte of opdracht)
  gewonnen: number
  verloren: number
  winrate: number | null
  gewonnenWaarde: number
}

export type FunnelData = {
  // Huidige stand (current-state)
  openAanvragen: FunnelTelling
  openOffertes: FunnelTelling
  gewonnen: FunnelTelling
  verloren: FunnelTelling
  winRateAantal: number | null
  winRateWaarde: number | null
  gemOffertewaarde: number | null
  // Periode (kalenderjaar tot nu)
  jaar: number
  instroomDitJaar: number          // aanvragen ontvangen dit jaar (created_at)
  verzondenDitJaar: number         // offertes verstuurd dit jaar (verzonden_op)
  verzondenWaardeDitJaar: number
  gemDoorlooptijdDagen: number | null
  medDoorlooptijdDagen: number | null
  // Breakdowns
  pipelinePerFase: { fase: string; aantal: number; waarde: number }[]
  perFiliaal: FunnelDimRij[]
  perCategorie: FunnelDimRij[]
  lostReasons: { reden: string; aantal: number }[]
  trend: { maand: string; instroom: number; verzonden: number }[]
}

const AANVRAAG_DOOD = new Set(['afgewezen', 'vervallen'])
const OFFERTE_DOOD  = new Set(['verloren', 'vervallen'])

function isOpenAanvraag(d: FunnelDossier): boolean {
  return d.hoofdstatus === 'aanvraag' && !AANVRAAG_DOOD.has(d.aanvraag_substatus ?? '')
}
function isOpenOfferte(d: FunnelDossier): boolean {
  return d.hoofdstatus === 'offerte' && !OFFERTE_DOOD.has(d.offerte_substatus ?? '')
}
function isGewonnen(d: FunnelDossier): boolean {
  return d.hoofdstatus === 'opdracht'
}
function isVerloren(d: FunnelDossier): boolean {
  // Verloren én vervallen tellen als niet-gewonnen offerte (anders wordt verlies onderschat).
  return d.offerte_substatus === 'verloren' || d.offerte_substatus === 'vervallen'
}
/** Heeft minimaal de offertefase bereikt (offerte uitgebracht of opdracht geworden). */
function bereikteOfferte(d: FunnelDossier): boolean {
  return d.hoofdstatus === 'offerte' || d.hoofdstatus === 'opdracht' || d.verzonden_op != null
}

function median(getallen: number[]): number | null {
  if (getallen.length === 0) return null
  const s = [...getallen].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function dagenTussen(vanISO: string, totISO: string): number {
  return (new Date(totISO).getTime() - new Date(vanISO).getTime()) / 86_400_000
}

function dimRijen(dossiers: FunnelDossier[], key: (d: FunnelDossier) => string | null): FunnelDimRij[] {
  const map = new Map<string, { offertes: number; gewonnen: number; verloren: number; gewonnenWaarde: number }>()
  for (const d of dossiers) {
    const label = key(d) ?? 'Onbekend'
    if (!map.has(label)) map.set(label, { offertes: 0, gewonnen: 0, verloren: 0, gewonnenWaarde: 0 })
    const r = map.get(label)!
    if (bereikteOfferte(d)) r.offertes++
    if (isGewonnen(d)) { r.gewonnen++; r.gewonnenWaarde += d.bedrag_excl_btw ?? 0 }
    if (isVerloren(d)) r.verloren++
  }
  return [...map.entries()]
    .map(([label, r]) => ({
      label,
      ...r,
      winrate: (r.gewonnen + r.verloren) > 0 ? (r.gewonnen / (r.gewonnen + r.verloren)) * 100 : null,
    }))
    .sort((a, b) => b.gewonnenWaarde - a.gewonnenWaarde)
}

/**
 * @param nu  Referentiemoment (ISO). Bepaalt "dit jaar" en de 12-maands trend.
 *            Meegegeven (i.p.v. new Date()) zodat snapshots reproduceerbaar zijn.
 */
export function berekenFunnel(
  dossiers: FunnelDossier[],
  lostReasonsRaw: { reden: string | null }[],
  nuISO: string,
): FunnelData {
  const nu = new Date(nuISO)
  const jaar = nu.getFullYear()
  const jaarStart = new Date(jaar, 0, 1).getTime()

  const som = (pred: (d: FunnelDossier) => boolean): FunnelTelling => {
    let aantal = 0, waarde = 0
    for (const d of dossiers) if (pred(d)) { aantal++; waarde += d.bedrag_excl_btw ?? 0 }
    return { aantal, waarde }
  }

  const openAanvragen = som(isOpenAanvraag)
  const openOffertes  = som(isOpenOfferte)
  const gewonnen      = som(isGewonnen)
  const verloren      = som(isVerloren)

  const winNoemer = gewonnen.aantal + verloren.aantal
  const winRateAantal = winNoemer > 0 ? (gewonnen.aantal / winNoemer) * 100 : null
  const winNoemerW = gewonnen.waarde + verloren.waarde
  const winRateWaarde = winNoemerW > 0 ? (gewonnen.waarde / winNoemerW) * 100 : null

  // Gemiddelde offertewaarde: over dossiers die de offertefase bereikten en een bedrag hebben.
  const offerteBedragen = dossiers.filter(d => bereikteOfferte(d) && (d.bedrag_excl_btw ?? 0) > 0).map(d => d.bedrag_excl_btw!)
  const gemOffertewaarde = offerteBedragen.length ? offerteBedragen.reduce((s, v) => s + v, 0) / offerteBedragen.length : null

  // Periode-cijfers (dit kalenderjaar)
  let instroomDitJaar = 0, verzondenDitJaar = 0, verzondenWaardeDitJaar = 0
  const doorlooptijden: number[] = []
  for (const d of dossiers) {
    if (d.created_at && new Date(d.created_at).getTime() >= jaarStart) instroomDitJaar++
    if (d.verzonden_op && new Date(d.verzonden_op).getTime() >= jaarStart) {
      verzondenDitJaar++
      verzondenWaardeDitJaar += d.bedrag_excl_btw ?? 0
    }
    if (d.created_at && d.verzonden_op) {
      const dagen = dagenTussen(d.created_at, d.verzonden_op)
      if (dagen >= 0 && dagen < 365) doorlooptijden.push(dagen)
    }
  }
  const gemDoorlooptijdDagen = doorlooptijden.length
    ? doorlooptijden.reduce((s, v) => s + v, 0) / doorlooptijden.length : null
  const medDoorlooptijdDagen = median(doorlooptijden)

  // Pipeline per fase (huidige stand, levende dossiers)
  const pipelinePerFase = [
    { fase: 'Open aanvragen', ...openAanvragen },
    { fase: 'Open offertes',  ...openOffertes },
    { fase: 'Gewonnen (opdracht)', ...gewonnen },
  ].map(x => ({ fase: x.fase, aantal: x.aantal, waarde: x.waarde }))

  const perFiliaal   = dimRijen(dossiers, d => d.bouw7_filiaal)
  const perCategorie = dimRijen(dossiers, d => d.categorie)

  // Verliesredenen uit de historie (waar beschikbaar)
  const redenMap = new Map<string, number>()
  for (const r of lostReasonsRaw) {
    const reden = (r.reden ?? '').trim() || 'Geen reden opgegeven'
    redenMap.set(reden, (redenMap.get(reden) ?? 0) + 1)
  }
  const lostReasons = [...redenMap.entries()]
    .map(([reden, aantal]) => ({ reden, aantal }))
    .sort((a, b) => b.aantal - a.aantal)

  // Trend: laatste 12 maanden (instroom op created_at, verzonden op verzonden_op)
  const maanden: { key: string; maand: string; instroom: number; verzonden: number }[] = []
  const maandIndex = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(jaar, nu.getMonth() - i, 1)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    maandIndex.set(key, maanden.length)
    maanden.push({
      key,
      maand: dt.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }),
      instroom: 0,
      verzonden: 0,
    })
  }
  const maandKey = (iso: string) => {
    const dt = new Date(iso)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  }
  for (const d of dossiers) {
    if (d.created_at) { const i = maandIndex.get(maandKey(d.created_at)); if (i != null) maanden[i].instroom++ }
    if (d.verzonden_op) { const i = maandIndex.get(maandKey(d.verzonden_op)); if (i != null) maanden[i].verzonden++ }
  }
  const trend = maanden.map(({ maand, instroom, verzonden }) => ({ maand, instroom, verzonden }))

  return {
    openAanvragen, openOffertes, gewonnen, verloren,
    winRateAantal, winRateWaarde, gemOffertewaarde,
    jaar, instroomDitJaar, verzondenDitJaar, verzondenWaardeDitJaar,
    gemDoorlooptijdDagen, medDoorlooptijdDagen,
    pipelinePerFase, perFiliaal, perCategorie, lostReasons, trend,
  }
}

/* ════════════════════════════════════════════════════════════════════
 * Calculator-prestaties
 * ════════════════════════════════════════════════════════════════════ */

export type CalculatorStat = {
  calculator_id: string
  naam: string
  kleur: string | null
  offertes: number            // dossiers met calculator die de offertefase bereikten
  gewonnen: number
  verloren: number
  winrate: number | null
  gewonnenWaarde: number
  gemOffertewaarde: number | null
  gemDoorlooptijdDagen: number | null
  openPipelineWaarde: number  // som bedrag van open offertes
}

export function berekenCalculatorStats(
  dossiers: FunnelDossier[],
  namen: Map<string, { naam: string; kleur: string | null }>,
): CalculatorStat[] {
  type Acc = {
    offertes: number; gewonnen: number; verloren: number
    gewonnenWaarde: number; offerteBedragen: number[]; doorlooptijden: number[]
    openPipelineWaarde: number
  }
  const map = new Map<string, Acc>()
  const leeg = (): Acc => ({
    offertes: 0, gewonnen: 0, verloren: 0, gewonnenWaarde: 0,
    offerteBedragen: [], doorlooptijden: [], openPipelineWaarde: 0,
  })

  for (const d of dossiers) {
    if (!d.calculator_id) continue
    if (!map.has(d.calculator_id)) map.set(d.calculator_id, leeg())
    const a = map.get(d.calculator_id)!
    if (bereikteOfferte(d)) {
      a.offertes++
      if ((d.bedrag_excl_btw ?? 0) > 0) a.offerteBedragen.push(d.bedrag_excl_btw!)
    }
    if (isGewonnen(d)) { a.gewonnen++; a.gewonnenWaarde += d.bedrag_excl_btw ?? 0 }
    if (isVerloren(d)) a.verloren++
    if (isOpenOfferte(d)) a.openPipelineWaarde += d.bedrag_excl_btw ?? 0
    if (d.created_at && d.verzonden_op) {
      const dagen = dagenTussen(d.created_at, d.verzonden_op)
      if (dagen >= 0 && dagen < 365) a.doorlooptijden.push(dagen)
    }
  }

  return [...map.entries()]
    .map(([calculator_id, a]) => {
      const info = namen.get(calculator_id)
      const winNoemer = a.gewonnen + a.verloren
      return {
        calculator_id,
        naam: info?.naam ?? 'Onbekend',
        kleur: info?.kleur ?? null,
        offertes: a.offertes,
        gewonnen: a.gewonnen,
        verloren: a.verloren,
        winrate: winNoemer > 0 ? (a.gewonnen / winNoemer) * 100 : null,
        gewonnenWaarde: a.gewonnenWaarde,
        gemOffertewaarde: a.offerteBedragen.length
          ? a.offerteBedragen.reduce((s, v) => s + v, 0) / a.offerteBedragen.length : null,
        gemDoorlooptijdDagen: a.doorlooptijden.length
          ? a.doorlooptijden.reduce((s, v) => s + v, 0) / a.doorlooptijden.length : null,
        openPipelineWaarde: a.openPipelineWaarde,
      }
    })
    .sort((a, b) => b.gewonnenWaarde - a.gewonnenWaarde)
}
