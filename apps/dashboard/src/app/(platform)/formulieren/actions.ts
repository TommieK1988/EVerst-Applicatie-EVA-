'use server'

import { randomUUID } from 'crypto'
import { createAdminClient, createClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  FormTemplate,
  FormVersie,
  FormInzending,
  FormSchema,
  FormInzendingStatus,
  FormulierVoortgang,
} from '@/components/formulieren/types'
import { defaultSchema, normalizeSchemaRequired } from '@/components/formulieren/types'
import type { Json } from '@everts/database/types'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { materialiseerAandachtspunten } from '@/lib/dossiers/oplevering'

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

/**
 * Het dossier van een taak: de directe koppeling op de taak, anders die van de
 * actielijst waar hij onder hangt. Formulier-taken uit een actielijst-sjabloon
 * hebben zelf géén `dossier_id` — dat zit alleen op de lijst. Zonder deze
 * terugval kreeg een inzending die via zo'n taak werd ingevuld geen dossier en
 * viel hij daarna buiten het KAM/VGM-overzicht en het VCA-tab van de opdracht.
 */
async function resolveTaakDossierId(taskId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tasks')
    .select('dossier_id, task_lists(dossier_id)')
    .eq('id', taskId)
    .maybeSingle()
  if (!data) return null
  const rij = data as unknown as {
    dossier_id: string | null
    task_lists: { dossier_id: string | null } | null
  }
  return rij.dossier_id ?? rij.task_lists?.dossier_id ?? null
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

  // Komt de inzending uit een taak zonder expliciet dossier, dan leiden we het
  // dossier hier alsnog af. Zo is de koppeling niet afhankelijk van wat de
  // aanroepende pagina in de URL meegaf.
  const dossierId =
    input.dossier_id ?? (input.task_id ? await resolveTaakDossierId(input.task_id) : null)

  if (input.inzending_id) {
    // Bijwerken. Een concept dat eerder zonder dossier is ontstaan, krijgt de
    // koppeling alsnog zodra we hem nu wél kunnen afleiden.
    const patch: { waarden: Json; dossier_id?: string } = {
      waarden: input.waarden as unknown as Json,
    }
    if (dossierId) patch.dossier_id = dossierId

    const { data, error } = await supabase
      .from('form_inzendingen')
      .update(patch)
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
      dossier_id: dossierId,
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

  // Gemelde aandachtspunten als opleverpunten op het dossier zetten (status "nieuw", wacht op triage).
  try { await materialiseerAandachtspunten(id) } catch { /* niet-blokkerend */ }

  revalidatePath(`/formulieren/${templateId}/inzendingen`)
  return { ok: true, data: undefined }
}

/* ── Aandachtspunt-foto's ─────────────────────────────────────────────
 * Foto's bij een aandachtspunt gaan bij het kiezen al naar de opslag, niet als base64 mee in de
 * inzending: dat laatste knalt door de body-limiet van server-actions zodra iemand een paar
 * telefoonfoto's meestuurt. Het punt zelf bestaat pas na indienen, dus de foto krijgt een pad op
 * dossierniveau; bij materialisatie wordt de URL aan het nieuwe punt gehangen.
 */

const MAX_FOTO_BYTES = 8 * 1024 * 1024
const TOEGESTANE_FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function uploadAandachtspuntFoto(
  dossierId: string | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const file = formData.get('foto')
  if (!(file instanceof File)) return { ok: false, error: 'Geen bestand.' }
  if (file.size > MAX_FOTO_BYTES) return { ok: false, error: 'Deze foto is te groot (max. 8 MB).' }
  if (!TOEGESTANE_FOTO_TYPES.includes(file.type)) return { ok: false, error: 'Alleen foto\'s zijn toegestaan.' }

  const supabase = createAdminClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `aandachtspunten/${dossierId ?? 'los'}/intern/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage
    .from('oplever-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) return { ok: false, error: error.message }
  const { data } = supabase.storage.from('oplever-fotos').getPublicUrl(path)
  return { ok: true, data: data.publicUrl }
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

// ── Formulier-taken van actieve dossiers (Overzicht-scherm) ───────

import { getActieveDossierContext, type DossierContext } from '@/lib/dossiers/actief'
import { getFormulierTaken, type FormulierTaak } from '@/lib/formulieren/formulier-taken'

/** Platte rij voor het Formulieren-overzicht: form_taak + dossier-context. */
export type FormulierTaakRij = {
  id: string
  template_id: string
  formulier_naam: string
  categorie: string | null
  status: FormulierVoortgang
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
 *
 * De taken komen uit `tasks` (de actielijsten), niet uit `form_taken`: die tabel
 * is nooit gevuld geraakt, waardoor dit scherm altijd leeg bleef.
 */
export async function getFormTakenVoorActieveDossiers(): Promise<FormulierTaakRij[]> {
  const supabase = createAdminClient()

  const { ids, context } = await getActieveDossierContext()
  if (ids.length === 0) return []

  const taken = await getFormulierTaken({ dossierIds: ids })
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
    const ctx = context.get(t.dossier_id)
    if (!ctx) continue
    rijen.push({
      id: t.id,
      template_id: t.formulier_template_id,
      formulier_naam: t.formulier_naam,
      categorie: t.formulier_categorie,
      status: taakWeergaveStatus(t),
      deadline: t.deadline,
      inzending_id: t.inzending_id,
      toegewezen_aan: t.toegewezen_aan,
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

  // Deadline eerst, taken zonder deadline achteraan.
  rijen.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
  return rijen
}

/**
 * De status zoals het overzicht hem toont. Een taak en zijn formulier hebben
 * elk een eigen status; wat de gebruiker wil weten is hoe ver het formulier is.
 * Een afgekeurd formulier weegt daarbij zwaarder dan een afgevinkte taak.
 */
function taakWeergaveStatus(taak: FormulierTaak): FormulierVoortgang {
  if (taak.inzending_status === 'afgekeurd') return 'afgekeurd'
  if (taak.status === 'gereed') return 'afgerond'
  if (taak.formulier_ingevuld) return 'ingediend'
  if (taak.inzending_status === 'concept' || taak.status === 'in_behandeling') return 'bezig'
  return 'open'
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
