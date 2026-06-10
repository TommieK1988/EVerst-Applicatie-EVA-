'use server'

import { createAdminClient, createClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  FormTemplate,
  FormVersie,
  FormInzending,
  FormTaak,
  FormSchema,
  FormInzendingStatus,
  FormTaakStatus,
} from '@/components/formulieren/types'
import { defaultSchema } from '@/components/formulieren/types'

// ── Resultaat-types ──────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ── Templates ────────────────────────────────────────────────────────

export async function getFormTemplates(
  status?: string
): Promise<ActionResult<FormTemplate[]>> {
  const supabase = createAdminClient()
  let query = supabase
    .from('form_templates')
    .select('*')
    .order('bijgewerkt_op', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as FormTemplate[] }
}

export async function getFormTemplate(id: string): Promise<ActionResult<FormTemplate>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Formulier niet gevonden.' }
  return { ok: true, data: data as FormTemplate }
}

export async function createFormTemplate(input: {
  naam: string
  omschrijving?: string
  categorie?: string
}): Promise<ActionResult<FormTemplate>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()

  const { data, error } = await supabase
    .from('form_templates')
    .insert({
      naam: input.naam,
      omschrijving: input.omschrijving ?? null,
      categorie: input.categorie ?? null,
      status: 'concept',
      huidige_versie: 1,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  // Maak versie 1 aan met leeg schema
  const template = data as FormTemplate
  const { error: versieError } = await supabase.from('form_versies').insert({
    template_id: template.id,
    versienummer: 1,
    schema: defaultSchema(),
    aangemaakt_door: user?.id ?? null,
  })

  if (versieError) {
    // Ruim de template op zodat er geen wees-rijen achterblijven
    await supabase.from('form_templates').delete().eq('id', template.id)
    return { ok: false, error: 'Versie aanmaken mislukt: ' + versieError.message }
  }

  revalidatePath('/formulieren')
  return { ok: true, data: template }
}

export async function updateFormTemplate(
  id: string,
  input: { naam?: string; omschrijving?: string; categorie?: string; is_kam_vgm?: boolean }
): Promise<ActionResult<FormTemplate>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_templates')
    .update({ ...input })
    .eq('id', id)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: data as FormTemplate }
}

export async function publishFormTemplate(id: string): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_templates')
    .update({ status: 'gepubliceerd' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  revalidatePath(`/formulieren/${id}/bewerken`)
  return { ok: true, data: undefined }
}

export async function archiveFormTemplate(id: string): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_templates')
    .update({ status: 'gearchiveerd' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: undefined }
}

export async function deleteFormTemplate(id: string): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_templates')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: undefined }
}

// ── Versies ───────────────────────────────────────────────────────────

export async function getFormVersies(
  templateId: string
): Promise<ActionResult<FormVersie[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_versies')
    .select('*')
    .eq('template_id', templateId)
    .order('versienummer', { ascending: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as FormVersie[] }
}

export async function getLatestFormVersie(
  templateId: string
): Promise<ActionResult<FormVersie>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_versies')
    .select('*')
    .eq('template_id', templateId)
    .order('versienummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Geen versie gevonden.' }
  return { ok: true, data: data as FormVersie }
}

export async function saveFormVersie(
  templateId: string,
  schema: FormSchema,
  wijzigingsnota?: string
): Promise<ActionResult<FormVersie>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()

  // Haal huidige versienummer op
  const { data: tmpl } = await supabase
    .from('form_templates')
    .select('huidige_versie')
    .eq('id', templateId)
    .single()

  const huidig = (tmpl as { huidige_versie: number } | null)?.huidige_versie ?? 0
  const nieuw = huidig + 1

  const { data, error } = await supabase
    .from('form_versies')
    .insert({
      template_id: templateId,
      versienummer: nieuw,
      schema,
      wijzigingsnota: wijzigingsnota ?? null,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  // Verhoog versienummer op template
  await supabase
    .from('form_templates')
    .update({ huidige_versie: nieuw })
    .eq('id', templateId)

  revalidatePath(`/formulieren/${templateId}/bewerken`)
  return { ok: true, data: data as FormVersie }
}

// ── Inzendingen ───────────────────────────────────────────────────────

export async function getFormInzendingen(
  templateId: string,
  filters?: {
    status?: FormInzendingStatus
    ingediend_door?: string
    van?: string
    tot?: string
  }
): Promise<ActionResult<FormInzending[]>> {
  const supabase = createAdminClient()
  let query = supabase
    .from('form_inzendingen')
    .select('*, versie:versie_id(versienummer)')
    .eq('template_id', templateId)
    .order('aangemaakt_op', { ascending: false })

  if (filters?.status)         query = query.eq('status', filters.status)
  if (filters?.ingediend_door) query = query.eq('ingediend_door', filters.ingediend_door)
  if (filters?.van)            query = query.gte('aangemaakt_op', filters.van)
  if (filters?.tot)            query = query.lte('aangemaakt_op', filters.tot)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as FormInzending[] }
}

export async function getFormInzending(id: string): Promise<ActionResult<FormInzending>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_inzendingen')
    .select('*, versie:versie_id(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Inzending niet gevonden.' }
  return { ok: true, data: data as FormInzending }
}

export async function saveFormInzending(input: {
  template_id: string
  versie_id: string
  waarden: Record<string, unknown>
  submission_uuid?: string
  dossier_id?: string
  project_ref?: string
  inzending_id?: string  // bestaande concept bijwerken
}): Promise<ActionResult<FormInzending>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()

  if (input.inzending_id) {
    // Bijwerken
    const { data, error } = await supabase
      .from('form_inzendingen')
      .update({ waarden: input.waarden })
      .eq('id', input.inzending_id)
      .eq('status', 'concept')
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data as FormInzending }
  }

  // Nieuw concept
  const { data, error } = await supabase
    .from('form_inzendingen')
    .insert({
      template_id: input.template_id,
      versie_id: input.versie_id,
      status: 'concept',
      waarden: input.waarden,
      submission_uuid: input.submission_uuid ?? null,
      dossier_id: input.dossier_id ?? null,
      project_ref: input.project_ref ?? null,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/formulieren/${input.template_id}/inzendingen`)
  return { ok: true, data: data as FormInzending }
}

export async function submitFormInzending(
  id: string
): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()
  const { data, error } = await supabase
    .from('form_inzendingen')
    .update({
      status: 'ingediend',
      ingediend_op: new Date().toISOString(),
      ingediend_door: user?.id ?? null,
    })
    .eq('id', id)
    .select('template_id')
    .single()
  if (error) return { ok: false, error: error.message }
  const templateId = (data as { template_id: string }).template_id
  revalidatePath(`/formulieren/${templateId}/inzendingen`)
  return { ok: true, data: undefined }
}

export async function updateInzendingStatus(
  id: string,
  status: FormInzendingStatus
): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_inzendingen')
    .update({ status })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: undefined }
}

// ── Taken ──────────────────────────────────────────────────────────────

export async function getFormTaken(filters?: {
  toegewezen_aan?: string
  status?: FormTaakStatus
  template_id?: string
}): Promise<ActionResult<FormTaak[]>> {
  const supabase = createAdminClient()
  let query = supabase
    .from('form_taken')
    .select('*, template:template_id(naam, categorie, status)')
    .order('aangemaakt_op', { ascending: false })

  if (filters?.toegewezen_aan) query = query.eq('toegewezen_aan', filters.toegewezen_aan)
  if (filters?.status)         query = query.eq('status', filters.status)
  if (filters?.template_id)    query = query.eq('template_id', filters.template_id)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as FormTaak[] }
}

export async function createFormTaak(input: {
  template_id: string
  toegewezen_aan?: string
  deadline?: string
  opmerkingen?: string
  vooringevuld?: Record<string, unknown>
  dossier_id?: string
}): Promise<ActionResult<FormTaak>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()
  const { data, error } = await supabase
    .from('form_taken')
    .insert({
      template_id: input.template_id,
      toegewezen_aan: input.toegewezen_aan ?? null,
      deadline: input.deadline ?? null,
      opmerkingen: input.opmerkingen ?? null,
      vooringevuld: input.vooringevuld ?? {},
      dossier_id: input.dossier_id ?? null,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: data as FormTaak }
}

export async function updateFormTaakStatus(
  id: string,
  status: FormTaakStatus
): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_taken')
    .update({ status })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren')
  return { ok: true, data: undefined }
}

// ── Gepubliceerde formulieren voor taak-koppeling ─────────────────

export async function getGepubliceerdeFormulieren(): Promise<
  { id: string; naam: string; categorie: string | null }[]
> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('form_templates')
    .select('id, naam, categorie')
    .eq('status', 'gepubliceerd')
    .order('naam')
  return (data ?? []) as { id: string; naam: string; categorie: string | null }[]
}
