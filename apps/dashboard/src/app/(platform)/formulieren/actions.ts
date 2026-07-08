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
import { defaultSchema, normalizeSchemaRequired } from '@/components/formulieren/types'
import type { Json } from '@everts/database/types'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'

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
    schema: defaultSchema() as unknown as Json,
    aangemaakt_door: user?.id ?? null,
  })

  if (versieError) {
    // Ruim de template op zodat er geen wees-rijen achterblijven
    await supabase.from('form_templates').delete().eq('id', template.id)
    return { ok: false, error: 'Versie aanmaken mislukt: ' + versieError.message }
  }

  revalidatePath('/formulieren/sjablonen')
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
  revalidatePath('/formulieren/sjablonen')
  return { ok: true, data: data as FormTemplate }
}

export async function publishFormTemplate(id: string): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_templates')
    .update({ status: 'gepubliceerd' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren/sjablonen')
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
  revalidatePath('/formulieren/sjablonen')
  return { ok: true, data: undefined }
}

export async function deleteFormTemplate(id: string): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('form_templates')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren/sjablonen')
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
  return { ok: true, data: (data ?? []) as unknown as FormVersie[] }
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
  return { ok: true, data: data as unknown as FormVersie }
}

export async function saveFormVersie(
  templateId: string,
  schema: FormSchema,
  wijzigingsnota?: string
): Promise<ActionResult<FormVersie>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()

  // Weergave-only velden (kop/tekstblok/scheidingslijn) mogen nooit verplicht
  // zijn — anders blokkeren ze het indienen. Normaliseer vóór opslaan.
  const genormaliseerd = normalizeSchemaRequired(schema)

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
      schema: genormaliseerd as unknown as Json,
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
  return { ok: true, data: data as unknown as FormVersie }
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
  return { ok: true, data: data as unknown as FormInzending }
}

export async function saveFormInzending(input: {
  template_id: string
  versie_id: string
  waarden: Record<string, unknown>
  submission_uuid?: string
  dossier_id?: string
  task_id?: string
  project_ref?: string
  inzending_id?: string  // bestaande concept bijwerken
}): Promise<ActionResult<FormInzending>> {
  const supabase = createAdminClient()
  const { data: { user } } = await (await createClient()).auth.getUser()

  if (input.inzending_id) {
    // Bijwerken
    const { data, error } = await supabase
      .from('form_inzendingen')
      .update({ waarden: input.waarden as unknown as Json })
      .eq('id', input.inzending_id)
      .eq('status', 'concept')
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data as unknown as FormInzending }
  }

  // Nieuw concept
  const { data, error } = await supabase
    .from('form_inzendingen')
    .insert({
      template_id: input.template_id,
      versie_id: input.versie_id,
      status: 'concept',
      waarden: input.waarden as unknown as Json,
      submission_uuid: input.submission_uuid ?? null,
      dossier_id: input.dossier_id ?? null,
      task_id: input.task_id ?? null,
      project_ref: input.project_ref ?? null,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/formulieren/${input.template_id}/inzendingen`)
  return { ok: true, data: data as unknown as FormInzending }
}

/**
 * Bestaand concept (nog niet ingediend) voor een specifieke taak.
 * Wordt gebruikt om het invullen te hervatten i.p.v. een dubbele inzending te maken.
 */
export async function getConceptInzendingVoorTaak(
  taskId: string
): Promise<ActionResult<FormInzending | null>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_inzendingen')
    .select('*')
    .eq('task_id', taskId)
    .eq('status', 'concept')
    .order('aangemaakt_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as FormInzending) ?? null }
}

/**
 * Bestaande concepten (nog niet ingediend) van een sjabloon op een dossier.
 * Gebruikt om bij het invullen te kiezen tussen een bestaand concept hervatten
 * of een nieuw exemplaar toevoegen — meerdere exemplaren per dossier zijn toegestaan.
 */
export async function getConceptInzendingenVoorDossier(
  templateId: string,
  dossierId: string
): Promise<ActionResult<FormInzending[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('form_inzendingen')
    .select('*')
    .eq('template_id', templateId)
    .eq('dossier_id', dossierId)
    .eq('status', 'concept')
    .order('aangemaakt_op', { ascending: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as unknown as FormInzending[]) ?? [] }
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
    .select('template_id, task_id')
    .single()
  if (error) return { ok: false, error: error.message }
  const { template_id: templateId, task_id: taskId } =
    data as { template_id: string; task_id: string | null }

  // Hangt het formulier aan een taak? Dan de taak automatisch voltooien.
  // Fouten hierin mogen het indienen niet blokkeren.
  if (taskId) {
    try { await updateTaakStatus(taskId, 'gereed') } catch { /* niet-blokkerend */ }
  }

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
  revalidatePath('/formulieren/overzicht')
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
      vooringevuld: (input.vooringevuld ?? {}) as unknown as Json,
      dossier_id: input.dossier_id ?? null,
      aangemaakt_door: user?.id ?? null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/formulieren/overzicht')
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
  revalidatePath('/formulieren/overzicht')
  return { ok: true, data: undefined }
}

// ── Formulier-taken van actieve dossiers (Overzicht-scherm) ───────

import { getActieveDossierContext, type DossierContext } from '@/lib/dossiers/actief'

/** Platte rij voor het Formulieren-overzicht: form_taak + dossier-context. */
export type FormulierTaakRij = {
  id: string
  template_id: string
  formulier_naam: string
  categorie: string | null
  status: FormTaakStatus
  deadline: string | null
  inzending_id: string | null
  toegewezen_aan: string | null
  toegewezen_naam: string | null
  // Dossier-context
  dossier_id: string
  dossiernummer: string | null
  dossier_titel: string
  dossier_sectie: DossierContext['sectie']
  dossier_fase: string
  dossier_substatus: string | null
  klant_naam: string | null
  projectleider_naam: string | null
  uitvoerder_naam: string | null
  calculator_naam: string | null
  werkvoorbereider_naam: string | null
  werkadres_stad: string | null
  verwacht_startdatum: string | null
  verwacht_einddatum: string | null
}

/**
 * Alle in te vullen formulier-taken van actieve dossiers, plat met dossier-context.
 * Voor het Formulieren-overzicht. Alleen vanuit Server Components aanroepen.
 */
export async function getFormTakenVoorActieveDossiers(): Promise<FormulierTaakRij[]> {
  const supabase = createAdminClient()

  const { ids, context } = await getActieveDossierContext()
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('form_taken')
    .select('*, template:template_id ( naam, categorie )')
    .in('dossier_id', ids)
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Fout bij ophalen formulier-taken: ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taken = (data ?? []) as any[]
  if (taken.length === 0) return []

  // Namen van toegewezen medewerkers ophalen.
  const userIds = [...new Set(taken.map(t => t.toegewezen_aan).filter(Boolean))] as string[]
  let namenMap: Record<string, string> = {}
  if (userIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabase as any
    const { data: meds } = await admin
      .from('medewerkers')
      .select('auth_user_id, voornaam, tussenvoegsel, achternaam')
      .in('auth_user_id', userIds)
    namenMap = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (meds ?? []).map((m: any) => [
        m.auth_user_id,
        [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
      ]),
    )
  }

  const rijen: FormulierTaakRij[] = []
  for (const t of taken) {
    const ctx = t.dossier_id ? context.get(t.dossier_id) : undefined
    if (!ctx) continue
    rijen.push({
      id: t.id,
      template_id: t.template_id,
      formulier_naam: t.template?.naam ?? '—',
      categorie: t.template?.categorie ?? null,
      status: t.status,
      deadline: t.deadline ?? null,
      inzending_id: t.inzending_id ?? null,
      toegewezen_aan: t.toegewezen_aan ?? null,
      toegewezen_naam: t.toegewezen_aan ? (namenMap[t.toegewezen_aan] ?? null) : null,
      dossier_id: ctx.id,
      dossiernummer: ctx.dossiernummer,
      dossier_titel: ctx.titel,
      dossier_sectie: ctx.sectie,
      dossier_fase: ctx.fase_label,
      dossier_substatus: ctx.substatus_label,
      klant_naam: ctx.klant_naam,
      projectleider_naam: ctx.projectleider_naam,
      uitvoerder_naam: ctx.uitvoerder_naam,
      calculator_naam: ctx.calculator_naam,
      werkvoorbereider_naam: ctx.werkvoorbereider_naam,
      werkadres_stad: ctx.werkadres_stad,
      verwacht_startdatum: ctx.verwacht_startdatum,
      verwacht_einddatum: ctx.verwacht_einddatum,
    })
  }

  return rijen
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

// ── Formulier-concepten (gedeeld per gebruiker) ──────────────────────
//
// Een nog-niet-ingediend formulier stond in localStorage (form_draft_${scope}) →
// device-lokaal. We bewaren het concept nu per (gebruiker, scope) in Supabase zodat
// het meereist naar een ander apparaat/browser. De actions scopen expliciet op de
// ingelogde gebruiker; de admin-client omzeilt RLS. formulier_concepten staat (nog)
// niet in de gegenereerde types → cast naar any.

/** Laadt het opgeslagen concept van de huidige gebruiker voor deze scope. */
export async function laadFormulierConcept(scope: string): Promise<Record<string, unknown> | null> {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('formulier_concepten')
    .select('waarden')
    .eq('user_id', user.id)
    .eq('scope', scope)
    .maybeSingle()
  return (data?.waarden as Record<string, unknown> | undefined) ?? null
}

/** Slaat (upsert) het concept van de huidige gebruiker voor deze scope op. */
export async function bewaarFormulierConcept(
  scope: string,
  waarden: Record<string, unknown>,
  templateId?: string | null,
  dossierId?: string | null,
): Promise<void> {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  await supabase
    .from('formulier_concepten')
    .upsert(
      {
        user_id: user.id,
        scope,
        template_id: templateId ?? null,
        dossier_id: dossierId ?? null,
        waarden: waarden as Json,
        bijgewerkt_op: new Date().toISOString(),
      },
      { onConflict: 'user_id,scope' },
    )
}

/** Verwijdert het concept van de huidige gebruiker voor deze scope (na indienen). */
export async function verwijderFormulierConcept(scope: string): Promise<void> {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  await supabase
    .from('formulier_concepten')
    .delete()
    .eq('user_id', user.id)
    .eq('scope', scope)
}
