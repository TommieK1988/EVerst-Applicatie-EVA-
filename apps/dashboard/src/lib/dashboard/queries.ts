import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import {
  berekenCommercieCijfers,
  type CommercieCijfers, type RapportageDossier,
} from '@/lib/commercie/rapportage'
import {
  berekenFunnel,
  berekenCalculatorStats,
  type ManagementProject,
  type ManagementAK,
  type ManagementDoelstelling,
  type ManagementOhw,
  type FunnelDossier,
  type FunnelData,
  type CalculatorStat,
  type MaandSnapshot,
  type MaandSnapshotSamenvatting,
} from './aggregaties'

/** Boekjaar waarvan de 1-jan OHW-stand op het live dashboard meetelt. */
export const HUIDIG_BOEKJAAR = new Date().getFullYear()

export interface MedewerkerInfo {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  afdeling: string | null
}

export async function getMedewerkerByAuthId(authUserId: string): Promise<MedewerkerInfo | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, afdeling')
    .eq('auth_user_id', authUserId)
    .eq('actief', true)
    .maybeSingle()
  return data ?? null
}

/* ── Management Dashboard ─────────────────────────────────────────── */

/**
 * Dossier-ids waarvoor de "Intern"-toggle (sleutel 'intern') aan staat.
 * Interne dossiers tellen niet mee in het Management-tab (KPI's, lijsten, funnel, werkvoorraad).
 */
export async function getInterneDossierIds(): Promise<Set<string>> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_toggles')
    .select('dossier_id, dossier_toggle_definities!inner(sleutel)')
    .eq('aan', true)
    .eq('dossier_toggle_definities.sleutel', 'intern')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Set((data ?? []).map((d: any) => d.dossier_id as string))
}

const MANAGEMENT_PROJECT_KOLOMMEN =
  'id, projectnummer, bouw7_id, filiaal, status, opdrachtgever, projectnaam, categorie, projectleider, ' +
  'geboekte_kosten, totale_opdracht, pct_gereed, totale_prognose, verwacht_resultaat, pct_marge, ' +
  'omzet_obv_pct, resultaat_obv_pct, gefactureerd, resultaat_gereed, pct_marge_gereed, verschil_pct_marge, ' +
  'is_gereed, kosten_split, dossier_id, dossier_sectie, bouw7_laatst_sync'

export async function getManagementProjecten(): Promise<ManagementProject[]> {
  const supabase = createAdminClient() as any
  const [{ data }, ohw, internSet] = await Promise.all([
    supabase
      .from('management_projecten')
      .select(MANAGEMENT_PROJECT_KOLOMMEN)
      .order('projectnummer', { ascending: true }),
    getManagementOhw(HUIDIG_BOEKJAAR),
    getInterneDossierIds(),
  ])
  const projecten = ((data ?? []) as ManagementProject[])
    .filter(p => !p.dossier_id || !internSet.has(p.dossier_id))

  // OHW-correctie per dossier koppelen op bouw7_id.
  const ohwMap = new Map<string, ManagementOhw>()
  for (const o of ohw) if (o.bouw7_id) ohwMap.set(o.bouw7_id, o)
  for (const p of projecten) {
    const o = p.bouw7_id ? ohwMap.get(p.bouw7_id) : undefined
    p.ohw_omzet     = o?.omzet_vorig_boekjaar     ?? 0
    p.ohw_resultaat = o?.resultaat_vorig_boekjaar ?? 0
  }

  // Geen handmatige project-override meer: `pct_gereed` = de door de sync berekende
  // bewakingscode-rollup (zie sync-management.ts berekenProjectControl).
  return projecten
}

/** OHW-correctieregels (handmatig per dossier), optioneel gefilterd op boekjaar. */
export async function getManagementOhw(boekjaar?: number): Promise<ManagementOhw[]> {
  const supabase = createAdminClient() as any
  let q = supabase
    .from('management_ohw')
    .select('id, boekjaar, bouw7_id, projectnummer, projectnaam, filiaal, omzet_vorig_boekjaar, resultaat_vorig_boekjaar, opmerkingen')
    .order('boekjaar', { ascending: false })
    .order('projectnummer', { ascending: true })
  if (boekjaar != null) q = q.eq('boekjaar', boekjaar)
  const { data } = await q
  return (data ?? []) as ManagementOhw[]
}

export type ManagementProjectKeuze = {
  bouw7_id: string
  projectnummer: string
  projectnaam: string
  opdrachtgever: string | null
  filiaal: string | null
}

/** Selecteerbare projecten voor de OHW-dossier-picker in Instellingen. */
export async function getManagementProjectenKeuze(): Promise<ManagementProjectKeuze[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_projecten')
    .select('bouw7_id, projectnummer, projectnaam, opdrachtgever, filiaal')
    .not('bouw7_id', 'is', null)
    .order('projectnummer', { ascending: true })
  return (data ?? []) as ManagementProjectKeuze[]
}

export async function getManagementAk(): Promise<ManagementAK[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_ak')
    .select('id, jaar, filiaal, bedrag_ak, opmerkingen')
    .order('jaar', { ascending: false })
  return (data ?? []) as ManagementAK[]
}

export async function getManagementDoelstellingen(): Promise<ManagementDoelstelling[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_doelstellingen')
    .select('id, jaar, filiaal, projectleider, omzet_doelstelling, resultaat_doelstelling')
    .order('jaar', { ascending: false })
  return (data ?? []) as ManagementDoelstelling[]
}

/** Unieke filialen + projectleiders uit management_projecten (voor Instellingen-dropdowns). */
export async function getManagementDimensies(): Promise<{ filialen: string[]; projectleiders: string[] }> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_projecten')
    .select('filiaal, projectleider')
  const filialen = new Set<string>()
  const projectleiders = new Set<string>()
  for (const r of (data ?? []) as { filiaal: string | null; projectleider: string | null }[]) {
    if (r.filiaal) filialen.add(r.filiaal)
    if (r.projectleider) projectleiders.add(r.projectleider)
  }
  return {
    filialen: [...filialen].sort(),
    projectleiders: [...projectleiders].sort(),
  }
}

/** Laatste sync-moment uit management_projecten. */
export async function getManagementLaatsteSync(): Promise<string | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_projecten')
    .select('bouw7_laatst_sync')
    .not('bouw7_laatst_sync', 'is', null)
    .order('bouw7_laatst_sync', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.bouw7_laatst_sync ?? null
}

/* ── Verkoop / funnel + calculators ───────────────────────────────── */

const FUNNEL_DOSSIER_KOLOMMEN =
  'id, hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, bedrag_excl_btw, ' +
  'categorie, bouw7_filiaal, calculator_id, created_at, verzonden_op, gearchiveerd'

/**
 * Lean dossier-projectie voor funnel/calculator-aggregatie (niet-gearchiveerd, niet-intern).
 *
 * Gepagineerd, niet `.limit(20000)`. PostgREST kapt elke respons af op `max-rows` (1000) en doet
 * dat stil: `error` blijft null, je krijgt gewoon duizend rijen. Een hogere `.limit()` verandert
 * daar niets aan — de servergrens wint altijd. Bij 1092 dossiers (sept. 2026) betekende dat een
 * funnel die 92 dossiers niet meetelde, zonder dat iets dat liet zien. Zie CLAUDE.md.
 */
async function getFunnelDossiers(): Promise<FunnelDossier[]> {
  const supabase = createAdminClient() as any
  const [rijen, internSet] = await Promise.all([
    haalAlleRijen<FunnelDossier & { id: string; gearchiveerd: boolean | null }>((van, tot) =>
      supabase.from('dossiers').select(FUNNEL_DOSSIER_KOLOMMEN).order('id').range(van, tot)),
    getInterneDossierIds(),
  ])
  return rijen.filter(d => d.gearchiveerd !== true && !internSet.has(d.id))
}

function medNaam(med: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null } | null): string {
  if (!med) return 'Onbekend'
  return [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') || 'Onbekend'
}

/** Funnel-cijfers: huidige pipeline-stand + instroom/verzonden trend + verliesredenen. */
export async function getFunnelData(nuISO?: string): Promise<FunnelData> {
  const supabase = createAdminClient() as any
  const [dossiers, redenenResp] = await Promise.all([
    getFunnelDossiers(),
    supabase
      .from('dossier_status_historie')
      .select('reden')
      .eq('naar_offerte_substatus', 'verloren'),
  ])
  const lostReasons = (redenenResp.data ?? []) as { reden: string | null }[]
  return berekenFunnel(dossiers, lostReasons, nuISO ?? new Date().toISOString())
}

/** Prestatie-cijfers per calculator (op basis van huidige dossierstand). */
export async function getCalculatorStats(): Promise<CalculatorStat[]> {
  const supabase = createAdminClient() as any
  const dossiers = await getFunnelDossiers()

  const ids = [...new Set(dossiers.map(d => d.calculator_id).filter(Boolean) as string[])]
  const namen = new Map<string, { naam: string; kleur: string | null }>()
  if (ids.length > 0) {
    const { data } = await supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, kleur')
      .in('id', ids)
    for (const m of (data ?? []) as any[]) {
      namen.set(m.id, { naam: medNaam(m), kleur: m.kleur ?? null })
    }
  }
  return berekenCalculatorStats(dossiers, namen)
}

/* ── Vastgestelde maandsnapshots ──────────────────────────────────── */

/** Lijst vastgestelde maanden (incl. kpi voor trendweergave), nieuwste eerst. */
export async function getMaandSnapshots(): Promise<MaandSnapshotSamenvatting[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_maand_snapshot')
    .select('id, periode, vastgesteld_door_naam, vastgesteld_op, opmerking, kpi')
    .order('periode', { ascending: false })
  return (data ?? []) as MaandSnapshotSamenvatting[]
}

/** Eén vastgestelde maand met volledige cijfers (kpi + funnel + calculators). */
export async function getMaandSnapshot(periode: string): Promise<MaandSnapshot | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_maand_snapshot')
    .select('id, periode, vastgesteld_door_naam, vastgesteld_op, opmerking, kpi, funnel, calculators')
    .eq('periode', periode)
    .maybeSingle()
  return (data ?? null) as MaandSnapshot | null
}

/**
 * Commerciële sturingscijfers voor het Verkoop-scherm: kans-gewogen pijplijn, tijd per fase,
 * conversie per eigenaar en offertes waar niets meer gebeurt.
 *
 * Aparte query naast `getFunnelData` omdat dit andere bronnen nodig heeft (de bewakingskaarten
 * en de fasehistorie) en omdat de funnel standen telt terwijl dit over beweging gaat.
 */
export async function getCommercieCijfers(nuISO?: string): Promise<CommercieCijfers> {
  // Getypeerde client: de tabellen staan in de gegenereerde types, dus hier is geen cast nodig.
  // De select-strings zijn bewust letterlijk — supabase-js leidt het rijtype daaruit af.
  const supabase = createAdminClient()

  const [dossierRijen, internSet, bewakingRijen, wisselRijen, gebeurtenisRijen] = await Promise.all([
    // Gepagineerd: bij >1000 dossiers kapt PostgREST stil af. Zie getFunnelDossiers.
    haalAlleRijen<RapportageDossier & { id: string; gearchiveerd: boolean | null }>((van, tot) =>
      supabase.from('dossiers')
        .select('id,titel,hoofdstatus,offerte_substatus,bedrag_excl_btw,verzonden_op,gearchiveerd')
        .order('id').range(van, tot)),
    getInterneDossierIds(),
    // `dossier_id` is nullable in het schema (een toekomstig verkoopsignaal heeft er geen);
    // het filter versmalt het type niet, dus de lege waarden vallen hieronder alsnog weg.
    haalAlleRijen<{ dossier_id: string | null; eigenaar_id: string | null; kans_pct: number | null; verwachte_opdracht: string | null }>((van, tot) =>
      supabase.from('commercie_bewaking')
        .select('dossier_id,eigenaar_id,kans_pct,verwachte_opdracht')
        .not('dossier_id', 'is', null).order('id').range(van, tot)),
    // Alleen offertefase-overgangen; dat is een fractie van de historie.
    haalAlleRijen<{ dossier_id: string; van_offerte_substatus: string | null; naar_offerte_substatus: string | null; op: string }>((van, tot) =>
      supabase.from('dossier_status_historie')
        .select('dossier_id,van_offerte_substatus,naar_offerte_substatus,op')
        .not('naar_offerte_substatus', 'is', null).order('id').range(van, tot)),
    haalAlleRijen<{ op: string; commercie_bewaking: { dossier_id: string | null } | { dossier_id: string | null }[] | null }>((van, tot) =>
      supabase.from('commercie_gebeurtenissen')
        .select('op, commercie_bewaking!inner(dossier_id)').order('id').range(van, tot)),
  ])

  const dossiers = dossierRijen.filter(d => d.gearchiveerd !== true && !internSet.has(d.id))

  // Laatste commerciële beweging per dossier: de nieuwste van (eigen gebeurtenis, fasewissel).
  // De verzenddatum is de terugval en zit in de berekening zelf.
  const laatsteBeweging: Record<string, string> = {}
  const noteer = (dossierId: string | null | undefined, op: string) => {
    if (!dossierId) return
    if (!laatsteBeweging[dossierId] || laatsteBeweging[dossierId] < op) laatsteBeweging[dossierId] = op
  }
  for (const g of gebeurtenisRijen) {
    const k = Array.isArray(g.commercie_bewaking) ? g.commercie_bewaking[0] : g.commercie_bewaking
    noteer(k?.dossier_id, g.op)
  }
  for (const w of wisselRijen) noteer(w.dossier_id, w.op)

  const eigenaarIds = [...new Set(bewakingRijen.map(b => b.eigenaar_id).filter(Boolean))] as string[]
  const eigenaarNamen: Record<string, string> = {}
  if (eigenaarIds.length > 0) {
    const { data } = await supabase.from('medewerkers')
      .select('id,voornaam,tussenvoegsel,achternaam').in('id', eigenaarIds)
    for (const m of data ?? []) eigenaarNamen[m.id] = medNaam(m)
  }

  return berekenCommercieCijfers({
    dossiers,
    bewaking: bewakingRijen
      .filter((b): b is typeof b & { dossier_id: string } => b.dossier_id != null),
    eigenaarNamen,
    fasewissels: wisselRijen.map(w => ({
      dossier_id: w.dossier_id,
      van: w.van_offerte_substatus,
      naar: w.naar_offerte_substatus,
      op: w.op,
    })),
    laatsteBeweging,
    nu: nuISO ?? new Date().toISOString(),
  })
}
