import { createAdminClient } from '@everts/database/server'
import {
  berekenFunnel,
  berekenCalculatorStats,
  type ManagementProject,
  type ManagementAK,
  type ManagementDoelstelling,
  type FunnelDossier,
  type FunnelData,
  type CalculatorStat,
  type MaandSnapshot,
  type MaandSnapshotSamenvatting,
} from './aggregaties'

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

const MANAGEMENT_PROJECT_KOLOMMEN =
  'id, projectnummer, bouw7_id, filiaal, status, opdrachtgever, projectnaam, categorie, projectleider, ' +
  'geboekte_kosten, totale_opdracht, pct_gereed, totale_prognose, verwacht_resultaat, pct_marge, ' +
  'omzet_obv_pct, resultaat_obv_pct, gefactureerd, resultaat_gereed, pct_marge_gereed, verschil_pct_marge, ' +
  'is_gereed, kosten_split, dossier_id, dossier_sectie, bouw7_laatst_sync'

export async function getManagementProjecten(): Promise<ManagementProject[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('management_projecten')
    .select(MANAGEMENT_PROJECT_KOLOMMEN)
    .order('projectnummer', { ascending: true })
  return (data ?? []) as ManagementProject[]
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
  'hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, bedrag_excl_btw, ' +
  'categorie, bouw7_filiaal, calculator_id, created_at, verzonden_op, gearchiveerd'

/** Lean dossier-projectie voor funnel/calculator-aggregatie (niet-gearchiveerd). */
async function getFunnelDossiers(): Promise<FunnelDossier[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select(FUNNEL_DOSSIER_KOLOMMEN)
    .limit(20000)
  return ((data ?? []) as (FunnelDossier & { gearchiveerd: boolean | null })[])
    .filter(d => d.gearchiveerd !== true)
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
