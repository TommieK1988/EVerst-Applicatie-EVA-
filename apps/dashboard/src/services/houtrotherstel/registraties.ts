import { createClient } from '@/lib/houtrotherstel/supabase/client'
import type {
  RepairRegistration,
  RegistratieForm,
  RegistratieFilters,
} from '@/lib/houtrotherstel/types'

export async function getRegistraties(
  filters?: RegistratieFilters
): Promise<RepairRegistration[]> {
  const supabase = createClient()

  let query = supabase
    .from('repair_registrations')
    .select(`
      *,
      projects(id, name, project_number),
      standard_repairs(id, name, code, category),
      repair_photos(id, photo_type, storage_path, file_name)
    `)
    .order('registration_date', { ascending: false })

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
      standard_repairs(id, name, code, category, description),
      repair_photos(id, photo_type, storage_path, file_name, created_at)
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

  const { data, error } = await supabase
    .from('repair_registrations')
    .insert({
      project_id: form.project_id,
      user_id: userId,
      registration_date: form.registration_date,
      location_block: form.location_block || null,
      floor: form.floor || null,
      room_or_unit: form.room_or_unit || null,
      facade_side: form.facade_side || null,
      component_type: form.component_type || null,
      element_number: form.element_number || null,
      damage_description: form.damage_description || null,
      damage_severity: form.damage_severity || null,
      damage_cause: form.damage_cause || null,
      standard_repair_id: form.standard_repair_id || null,
      custom_work_description: form.custom_work_description || null,
      notes: form.notes || null,
      status: form.status,
      control_status: form.control_status,
      completed_at: form.completed_at || null,
      checked_at: form.checked_at || null,
      labor_hours_snapshot: form.labor_hours_snapshot ?? null,
      labor_rate_snapshot: form.labor_rate_snapshot ?? null,
      labor_cost_snapshot: form.labor_cost_snapshot ?? null,
      material_cost_snapshot: form.material_cost_snapshot ?? null,
      cost_price_snapshot: form.cost_price_snapshot ?? null,
      sale_price_snapshot: form.sale_price_snapshot ?? null,
      repair_code_snapshot: form.repair_code_snapshot || null,
      repair_name_snapshot: form.repair_name_snapshot || null,
      repair_description_snapshot: form.repair_description_snapshot || null,
      actual_labor_hours: form.actual_labor_hours ?? null,
      actual_material_cost: form.actual_material_cost ?? null,
      actual_cost_price: form.actual_cost_price ?? null,
      actual_sale_price: form.actual_sale_price ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await logActivity(supabase, userId, 'registratie', data.id, 'create', null, form)

  return data as RepairRegistration
}

export async function updateRegistratie(
  id: string,
  form: Partial<RegistratieForm>,
  userId: string
): Promise<RepairRegistration> {
  const supabase = createClient()

  // Ophalen huidige staat voor audit log
  const { data: oldData } = await supabase
    .from('repair_registrations')
    .select('status, control_status')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('repair_registrations')
    .update(form)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Log activiteit
  await logActivity(supabase, userId, 'registratie', id, 'update', oldData, form)

  return data
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
