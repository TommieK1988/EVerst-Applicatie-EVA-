'use server'

import { createAdminClient } from '@everts/database/server'
import { getVcaActiesPerDossier } from '@/lib/kam/vca-acties'

export type KamInzending = {
  id: string
  aangemaakt_op: string
  ingediend_op: string | null
  status: string
  project_ref: string | null
  ingediend_door: string | null
  template: { naam: string; categorie: string | null } | null
  versie: { versienummer: number } | null
}

export type KamStats = {
  totaal_dit_jaar: number
  open_inspecties: number
}

export async function getKamInzendingen(filters?: {
  status?: string
  van?: string
  tot?: string
}): Promise<{ ok: true; data: KamInzending[] } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  // Eerst KAM-template-IDs ophalen
  const { data: templates, error: tErr } = await supabase
    .from('form_templates')
    .select('id')
    .eq('is_kam_vgm', true)

  if (tErr) return { ok: false, error: tErr.message }
  const templateIds = (templates ?? []).map((t: { id: string }) => t.id)
  if (templateIds.length === 0) return { ok: true, data: [] }

  let query = supabase
    .from('form_inzendingen')
    .select('*, template:template_id(naam, categorie), versie:versie_id(versienummer)')
    .in('template_id', templateIds)
    .order('aangemaakt_op', { ascending: false })
    .limit(200)

  if (filters?.status && filters.status !== 'alle') query = query.eq('status', filters.status)
  if (filters?.van)  query = query.gte('aangemaakt_op', filters.van)
  if (filters?.tot)  query = query.lte('aangemaakt_op', filters.tot + 'T23:59:59')

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as KamInzending[] }
}

export async function getKamStats(): Promise<KamStats> {
  const supabase = createAdminClient()

  const { data: templates } = await supabase
    .from('form_templates')
    .select('id')
    .eq('is_kam_vgm', true)

  const templateIds = (templates ?? []).map((t: { id: string }) => t.id)
  if (templateIds.length === 0) return { totaal_dit_jaar: 0, open_inspecties: 0 }

  const jaarStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [totaalResult, openResult] = await Promise.all([
    supabase
      .from('form_inzendingen')
      .select('id', { count: 'exact', head: true })
      .in('template_id', templateIds)
      .gte('aangemaakt_op', jaarStart),
    supabase
      .from('form_inzendingen')
      .select('id', { count: 'exact', head: true })
      .in('template_id', templateIds)
      .eq('status', 'ingediend'),
  ])

  return {
    totaal_dit_jaar: totaalResult.count ?? 0,
    open_inspecties: openResult.count ?? 0,
  }
}

export async function getKamTemplates(): Promise<{ id: string; naam: string }[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('form_templates')
    .select('id, naam')
    .eq('is_kam_vgm', true)
    .order('naam')
  return (data ?? []) as { id: string; naam: string }[]
}

export type VcaOpdrachtRij = {
  dossier_id: string
  projectnaam: string
  dossiernummer: string | null
  projectleider: string | null
  teamleider: string | null
  /** Aantal VCA-acties op de opdracht: taken met een KAM/VGM-formulier eraan. */
  acties_totaal: number
  /** Daarvan afgevinkt (status 'gereed'). */
  acties_gereed: number
  /** Daarvan met een ingediend of goedgekeurd formulier. */
  formulieren_ingevuld: number
}

type MedewerkerNaam = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null

function volledigeNaam(m: MedewerkerNaam): string | null {
  if (!m) return null
  const naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim()
  return naam || null
}

/**
 * Alle opdrachten (dossiers met hoofdstatus 'opdracht') waarop de VCA-toggle aanstaat,
 * met per opdracht de voortgang van de VCA-acties: hoeveel er afgevinkt zijn en van
 * hoeveel het formulier daadwerkelijk is ingediend. Die twee lopen uiteen zodra
 * iemand een actie afvinkt zonder het formulier in te vullen — juist dat wil je hier
 * kunnen zien.
 */
export async function getVcaOpdrachten(): Promise<VcaOpdrachtRij[]> {
  // `as any`: dossier_toggle_definities/dossier_toggles staan (nog) niet in de
  // gegenereerde DB-types — zelfde patroon als lib/dossiers/actions.ts.
  const supabase = createAdminClient() as any

  // 1. VCA-toggle-definitie
  const { data: def } = await supabase
    .from('dossier_toggle_definities')
    .select('id')
    .eq('sleutel', 'vca')
    .maybeSingle()
  if (!def) return []

  // 2. Dossiers waarop de VCA-toggle aanstaat
  const { data: toggles } = await supabase
    .from('dossier_toggles')
    .select('dossier_id')
    .eq('definitie_id', (def as { id: string }).id)
    .eq('aan', true)
  const dossierIds = (toggles ?? []).map((t: { dossier_id: string }) => t.dossier_id)
  if (dossierIds.length === 0) return []

  // 3. Opdrachten (alleen hoofdstatus 'opdracht') + projectleider/teamleider
  const { data: dossiers } = await supabase
    .from('dossiers')
    .select(`
      id, titel, dossiernummer,
      projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam ),
      teamleider:medewerkers!teamleider_id ( voornaam, tussenvoegsel, achternaam )
    `)
    .in('id', dossierIds)
    .eq('hoofdstatus', 'opdracht')
    .order('dossiernummer', { ascending: true })

  const opdrachten = (dossiers ?? []) as unknown as Array<{
    id: string
    titel: string | null
    dossiernummer: string | null
    projectleider: MedewerkerNaam
    teamleider: MedewerkerNaam
  }>
  if (opdrachten.length === 0) return []

  const opdrachtIds = opdrachten.map(o => o.id)

  // 4. De VCA-acties van deze opdrachten in één keer ophalen.
  const actiesPerDossier = await getVcaActiesPerDossier(opdrachtIds)

  // 5. Rijen samenstellen
  return opdrachten.map(o => {
    const acties = actiesPerDossier.get(o.id) ?? []
    return {
      dossier_id: o.id,
      projectnaam: o.titel ?? '—',
      dossiernummer: o.dossiernummer,
      projectleider: volledigeNaam(o.projectleider),
      teamleider: volledigeNaam(o.teamleider),
      acties_totaal: acties.length,
      acties_gereed: acties.filter(a => a.status === 'gereed').length,
      formulieren_ingevuld: acties.filter(a => a.formulier_ingevuld).length,
    }
  })
}
