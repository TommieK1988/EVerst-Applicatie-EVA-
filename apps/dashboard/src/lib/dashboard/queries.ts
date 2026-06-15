import { createAdminClient } from '@everts/database/server'
import type {
  ManagementProject,
  ManagementAK,
  ManagementDoelstelling,
} from '@/components/management/ManagementDashboard'

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
