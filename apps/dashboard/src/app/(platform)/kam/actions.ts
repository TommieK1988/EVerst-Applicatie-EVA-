'use server'

import { createAdminClient } from '@everts/database/server'

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
