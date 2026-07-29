import { createClient } from '@/lib/houtrotherstel/supabase/client'
import type { Recept } from './recepten'
import type {
  RepairRegistration,
  RegistratieForm,
  RegistratieRegelForm,
  RegistratieFilters,
} from '@/lib/houtrotherstel/types'

/** Bouwt een werkzaamheid-regel (met prijs-momentopname) uit een gekozen recept. */
export function regelVanRecept(recept: Recept, aantal: number, volgorde: number): RegistratieRegelForm {
  return {
    recept_id: recept.id || undefined,
    aantal,
    repair_code_snapshot: recept.code,
    repair_name_snapshot: recept.naam,
    repair_description_snapshot: recept.omschrijving ?? undefined,
    unit_snapshot: recept.eenheid ?? undefined,
    labor_hours_snapshot: recept.uren,
    labor_rate_snapshot: recept.uurtarief,
    labor_cost_snapshot: recept.arbeidskosten,
    material_cost_snapshot: recept.materiaalkosten,
    cost_price_snapshot: recept.kostprijs,
    sale_price_snapshot: recept.verkoopprijs,
    volgorde,
  }
}

export async function getRegistraties(
  filters?: RegistratieFilters
): Promise<RepairRegistration[]> {
  const supabase = createClient()

  let query = supabase
    .from('repair_registrations')
    .select(`
      *,
      projects(id, name, project_number),
      photos:repair_photos(id, photo_type, storage_path, file_name),
      lines:repair_registration_lines(*)
    `)
    .order('registration_date', { ascending: false })

  if (filters?.dossier_id) {
    query = query.eq('dossier_id', filters.dossier_id)
  }
  if (filters?.project_id) {
    query = query.eq('project_id', filters.project_id)
  }
  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.control_status) {
    query = query.eq('control_status', filters.control_status)
  }
  if (filters?.date_from) {
    query = query.gte('registration_date', filters.date_from)
  }
  if (filters?.date_to) {
    query = query.lte('registration_date', filters.date_to)
  }
  if (filters?.location_block) {
    query = query.ilike('location_block', `%${filters.location_block}%`)
  }
  if (filters?.component_type) {
    query = query.eq('component_type', filters.component_type)
  }
  if (filters?.search) {
    query = query.or(
      `element_number.ilike.%${filters.search}%,room_or_unit.ilike.%${filters.search}%,damage_description.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return metMedewerkerNaam(supabase, (data || []) as RepairRegistration[])
}

/**
 * Vult `medewerker_naam` aan. De registrant staat sinds de cutover in
 * `public.medewerkers`, maar deze client is op het `houtrotherstel`-schema gescoped
 * en kan daar niet naartoe embedden. De view `registraties_met_details` joint wél
 * over de schema's heen, dus halen we de naam daar op. Faalt stil (naam blijft null).
 */
async function metMedewerkerNaam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rijen: RepairRegistration[]
): Promise<RepairRegistration[]> {
  if (rijen.length === 0) return rijen

  const { data } = await supabase
    .from('registraties_met_details')
    .select('id, medewerker_naam')
    .in('id', rijen.map(r => r.id))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const namen = new Map<string, string | null>((data ?? []).map((d: any) => [d.id, d.medewerker_naam]))
  return rijen.map(r => ({ ...r, medewerker_naam: namen.get(r.id) ?? null }))
}

export async function getRegistratie(id: string): Promise<RepairRegistration | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('repair_registrations')
    .select(`
      *,
      projects(id, name, project_number, client_name),
      photos:repair_photos(id, photo_type, storage_path, file_name, created_at),
      lines:repair_registration_lines(*)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  const [rij] = await metMedewerkerNaam(supabase, [data as RepairRegistration])
  return rij ?? (data as RepairRegistration)
}

export async function createRegistratie(
  form: RegistratieForm,
  userId: string
): Promise<RepairRegistration> {
  const supabase = createClient()

  // Werkzaamheden (recept + aantal) bepalen het reparatietotaal. De aggregaat-
  // snapshots op de registratie zelf worden hieruit afgeleid, zodat overzichten en
  // rapportages op één veld kunnen blijven leunen zonder de regels te joinen.
  const regels = (form.werkzaamheden ?? []).filter(r => (r.aantal ?? 0) > 0)
  const agg = aggregeerRegels(regels)

  const { data, error } = await supabase
    .from('repair_registrations')
    .insert({
      project_id: form.project_id ?? null,
      dossier_id: form.dossier_id ?? null,
      user_id: userId,
      registration_date: form.registration_date,
      location_block: form.location_block || null,
      floor: form.floor || null,
      room_or_unit: form.room_or_unit || null,
      facade_side: form.facade_side || null,
      component_type: form.component_type || null,
      element_number: form.element_number || null,
      // Instelbare locatiewaarden (per-dossier niveaus) + handmatig-statusvlag.
      locatie: form.locatie ?? [],
      status_handmatig: form.status_handmatig ?? false,
      damage_description: form.damage_description || null,
      damage_severity: form.damage_severity || null,
      damage_cause: form.damage_cause || null,
      // Legacy enkelvoudige velden: gevuld met het eerste recept (of het meegegeven
      // legacy-veld) puur voor terugval; de waarheid staat in de regels.
      recept_id: regels[0]?.recept_id || form.recept_id || null,
      standard_repair_id: form.standard_repair_id || null,
      custom_work_description: form.custom_work_description || null,
      notes: form.notes || null,
      status: form.status,
      control_status: form.control_status,
      completed_at: form.completed_at || null,
      checked_at: form.checked_at || null,
      labor_hours_snapshot: agg.labor_hours ?? form.labor_hours_snapshot ?? null,
      labor_rate_snapshot: regels[0]?.labor_rate_snapshot ?? form.labor_rate_snapshot ?? null,
      labor_cost_snapshot: agg.labor_cost ?? form.labor_cost_snapshot ?? null,
      material_cost_snapshot: agg.material_cost ?? form.material_cost_snapshot ?? null,
      cost_price_snapshot: agg.cost_price ?? form.cost_price_snapshot ?? null,
      sale_price_snapshot: agg.sale_price ?? form.sale_price_snapshot ?? null,
      repair_code_snapshot: agg.code ?? form.repair_code_snapshot ?? null,
      repair_name_snapshot: agg.naam ?? form.repair_name_snapshot ?? null,
      repair_description_snapshot: form.repair_description_snapshot || null,
      actual_labor_hours: form.actual_labor_hours ?? null,
      actual_material_cost: form.actual_material_cost ?? null,
      actual_cost_price: form.actual_cost_price ?? null,
      actual_sale_price: form.actual_sale_price ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Regels wegschrijven. Mislukt dit, dan de zojuist aangemaakte registratie weer
  // opruimen — een reparatie zonder werkzaamheden heeft geen betekenis.
  if (regels.length > 0) {
    const { error: regelFout } = await supabase
      .from('repair_registration_lines')
      .insert(bouwRegelRijen(data.id, regels))
    if (regelFout) {
      await supabase.from('repair_registrations').delete().eq('id', data.id)
      throw new Error(regelFout.message)
    }
  }

  await logActivity(supabase, userId, 'registratie', data.id, 'create', null, form)

  return data as RepairRegistration
}

/** Bouwt de insert-rijen voor de werkzaamheden-regels van één registratie. */
function bouwRegelRijen(registrationId: string, regels: RegistratieRegelForm[]) {
  return regels.map((r, i) => ({
    registration_id: registrationId,
    recept_id: r.recept_id || null,
    aantal: r.aantal,
    repair_code_snapshot: r.repair_code_snapshot || null,
    repair_name_snapshot: r.repair_name_snapshot || null,
    repair_description_snapshot: r.repair_description_snapshot || null,
    unit_snapshot: r.unit_snapshot || null,
    labor_hours_snapshot: r.labor_hours_snapshot ?? null,
    labor_rate_snapshot: r.labor_rate_snapshot ?? null,
    labor_cost_snapshot: r.labor_cost_snapshot ?? null,
    material_cost_snapshot: r.material_cost_snapshot ?? null,
    cost_price_snapshot: r.cost_price_snapshot ?? null,
    sale_price_snapshot: r.sale_price_snapshot ?? null,
    volgorde: r.volgorde ?? i,
  }))
}

/** Telt werkzaamheden-regels op tot registratie-aggregaten (× aantal per stuk). */
function aggregeerRegels(regels: RegistratieRegelForm[]) {
  if (regels.length === 0) {
    return {
      sale_price: null, cost_price: null, labor_hours: null,
      labor_cost: null, material_cost: null, code: null, naam: null,
    }
  }
  let sale = 0, cost = 0, uren = 0, arbeid = 0, materiaal = 0
  for (const r of regels) {
    const a = r.aantal ?? 0
    sale += a * (r.sale_price_snapshot ?? 0)
    cost += a * (r.cost_price_snapshot ?? 0)
    uren += a * (r.labor_hours_snapshot ?? 0)
    arbeid += a * (r.labor_cost_snapshot ?? 0)
    materiaal += a * (r.material_cost_snapshot ?? 0)
  }
  const rond = (n: number) => Math.round(n * 100) / 100
  const naam = regels.length === 1
    ? (regels[0].repair_name_snapshot ?? null)
    : `${regels.length} werkzaamheden`
  return {
    sale_price: rond(sale),
    cost_price: rond(cost),
    labor_hours: rond(uren),
    labor_cost: rond(arbeid),
    material_cost: rond(materiaal),
    code: regels[0].repair_code_snapshot ?? null,
    naam,
  }
}

/**
 * Werkt een bestaande registratie bij (veld-editflow): locatie, status en de
 * werkzaamheden-regels. De regels worden vervangen (verwijderen + opnieuw
 * invoegen) en de aggregaat-snapshots opnieuw uit de regels afgeleid.
 */
export async function updateRegistratie(
  id: string,
  form: RegistratieForm,
  userId: string
): Promise<RepairRegistration> {
  const supabase = createClient()

  const regels = (form.werkzaamheden ?? []).filter(r => (r.aantal ?? 0) > 0)
  const agg = aggregeerRegels(regels)

  const { data: oldData } = await supabase
    .from('repair_registrations')
    .select('status, control_status')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('repair_registrations')
    .update({
      registration_date: form.registration_date,
      locatie: form.locatie ?? [],
      notes: form.notes || null,
      status: form.status,
      status_handmatig: form.status_handmatig ?? false,
      recept_id: regels[0]?.recept_id || null,
      labor_hours_snapshot: agg.labor_hours,
      labor_rate_snapshot: regels[0]?.labor_rate_snapshot ?? null,
      labor_cost_snapshot: agg.labor_cost,
      material_cost_snapshot: agg.material_cost,
      cost_price_snapshot: agg.cost_price,
      sale_price_snapshot: agg.sale_price,
      repair_code_snapshot: agg.code,
      repair_name_snapshot: agg.naam,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Regels vervangen: eerst weg, dan de actuele set terug.
  await supabase.from('repair_registration_lines').delete().eq('registration_id', id)
  if (regels.length > 0) {
    const { error: regelFout } = await supabase
      .from('repair_registration_lines')
      .insert(bouwRegelRijen(id, regels))
    if (regelFout) throw new Error(regelFout.message)
  }

  await logActivity(supabase, userId, 'registratie', id, 'update', oldData, form)

  return data as RepairRegistration
}

export async function updateRegistratieStatus(
  id: string,
  status: string,
  userId: string
): Promise<void> {
  const supabase = createClient()

  const updates: Record<string, unknown> = { status }

  if (status === 'gereed') {
    updates.completed_at = new Date().toISOString()
  }
  if (status === 'gecontroleerd' || status === 'afgekeurd') {
    updates.checked_at = new Date().toISOString()
    updates.control_status = status === 'gecontroleerd' ? 'goedgekeurd' : 'afgekeurd'
  }

  const { error } = await supabase
    .from('repair_registrations')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)

  await logActivity(supabase, userId, 'registratie', id, 'status_change', null, { status })
}

export async function deleteRegistratie(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('repair_registrations')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Foto's
export async function uploadPhoto(
  registrationId: string,
  file: File,
  photoType: 'voor' | 'tijdens' | 'na'
): Promise<string> {
  const supabase = createClient()

  const ext = file.name.split('.').pop()
  const fileName = `${registrationId}/${photoType}_${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('repair-photos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw new Error(uploadError.message)

  const { error: dbError } = await supabase.from('repair_photos').insert({
    registration_id: registrationId,
    photo_type: photoType,
    storage_path: fileName,
    file_name: file.name,
  })

  if (dbError) throw new Error(dbError.message)

  return fileName
}

export async function deletePhoto(photoId: string, storagePath: string): Promise<void> {
  const supabase = createClient()

  await supabase.storage.from('repair-photos').remove([storagePath])
  await supabase.from('repair_photos').delete().eq('id', photoId)
}

export function getPhotoUrl(supabase: ReturnType<typeof createClient>, storagePath: string): string {
  const { data } = supabase.storage
    .from('repair-photos')
    .getPublicUrl(storagePath)
  return data.publicUrl
}

// Hulpfunctie voor activity logging
async function logActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      old_value: oldValue,
      new_value: newValue,
    })
  } catch {
    // Logging mag niet de hoofdoperatie blokkeren
    console.warn('Activity log mislukt:', entityType, entityId)
  }
}
