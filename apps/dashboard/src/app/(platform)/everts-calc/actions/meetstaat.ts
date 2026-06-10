'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'

// ─── Meetstaat aanmaken ───────────────────────────────────────────────────────

export async function maakMeetstaat(projectId: string, naam?: string): Promise<string> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('paint_measurements')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const volgnr = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('paint_measurements')
    .insert({
      project_id: projectId,
      name: naam ?? `Meetstaat ${volgnr}`,
      status: 'concept',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken meetstaat: ${error.message}`)
  revalidatePath(`/projecten/${projectId}/meetstaat`)
  return data.id
}

// ─── Meetregel upsert ─────────────────────────────────────────────────────────

export async function upsertMeetregel(data: {
  id?: string
  measurement_id: string
  project_id: string
  group_id: string
  line_no?: number
  item_id?: string | null
  treatment_id?: string | null
  onderdeel?: string | null
  type?: string | null
  behandeling?: string | null
  description?: string | null
  width_mm?: number | null
  height_mm?: number | null
  length_mm?: number | null
  count?: number
  quantity?: number | null
  unit?: string
  specification?: string | null
  remarks?: string | null
  is_draft?: boolean
}): Promise<string> {
  const supabase = await createClient()

  const { data: regel, error } = await supabase
    .from('paint_measurement_lines')
    .upsert(
      {
        id:             data.id,
        measurement_id: data.measurement_id,
        project_id:     data.project_id,
        group_id:       data.group_id,
        line_no:        data.line_no,
        item_id:        data.item_id,
        treatment_id:   data.treatment_id,
        onderdeel:      data.onderdeel   ?? '',
        type:           data.type        ?? '',
        behandeling:    data.behandeling ?? '',
        description:    data.description,
        width_mm:       data.width_mm,
        height_mm:      data.height_mm,
        length_mm:      data.length_mm,
        count:          data.count,
        quantity:       data.quantity    ?? undefined,
        unit:           data.unit        ?? '',
        specification:  data.specification,
        remarks:        data.remarks,
        is_draft:       data.is_draft,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij upsert meetregel: ${error.message}`)

  // Herbereken aggregaat
  if (data.onderdeel && data.behandeling) {
    await herberekeningAggregaat({
      measurement_id: data.measurement_id,
      project_id:     data.project_id,
      group_id:       data.group_id,
      onderdeel:      data.onderdeel,
      type:           data.type ?? '',
      behandeling:    data.behandeling,
      unit:           data.unit ?? 'm²',
    })
  }

  return regel.id
}

// ─── Meetregel verwijderen ────────────────────────────────────────────────────

export async function verwijderMeetregel(data: {
  id: string
  measurement_id: string
  project_id: string
  group_id: string
  onderdeel: string
  type: string
  behandeling: string
  unit: string
}): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('paint_measurement_lines')
    .delete()
    .eq('id', data.id)

  if (error) throw new Error(`Fout bij verwijderen meetregel: ${error.message}`)

  await herberekeningAggregaat({
    measurement_id: data.measurement_id,
    project_id:     data.project_id,
    group_id:       data.group_id,
    onderdeel:      data.onderdeel,
    type:           data.type,
    behandeling:    data.behandeling,
    unit:           data.unit,
  })
}

// ─── Aggregaat herberekenen ───────────────────────────────────────────────────

async function herberekeningAggregaat(params: {
  measurement_id: string
  project_id: string
  group_id: string
  onderdeel: string
  type: string
  behandeling: string
  unit: string
}): Promise<void> {
  const supabase = await createClient()
  const { measurement_id, project_id, group_id, onderdeel, type, behandeling, unit } = params

  // Som van alle regels voor deze sleutel
  const { data: regels, error } = await supabase
    .from('paint_measurement_lines')
    .select('width_mm, height_mm, length_mm, count, quantity')
    .eq('measurement_id', measurement_id)
    .eq('group_id', group_id)
    .eq('onderdeel', onderdeel)
    .eq('behandeling', behandeling)
    .eq('is_draft', false)

  if (error) throw new Error(`Fout bij herberekening: ${error.message}`)

  const berekenHoeveelheid = (r: typeof regels[0]) => {
    if (r.quantity != null) return Number(r.quantity)
    if (r.width_mm != null && r.height_mm != null)
      return (r.width_mm / 1000) * (r.height_mm / 1000) * (r.count ?? 1)
    if (r.length_mm != null)
      return (r.length_mm / 1000) * (r.count ?? 1)
    return r.count ?? 0
  }

  const totaal = regels.reduce((s, r) => s + berekenHoeveelheid(r), 0)
  const aggregate_key = `${group_id}::${onderdeel.toLowerCase()}::${type.toLowerCase()}::${behandeling.toLowerCase()}`
  const nu = new Date().toISOString()

  // Bestaand aggregaat opzoeken
  const { data: bestaand } = await supabase
    .from('paint_measurement_aggregates')
    .select('id, calculation_line_id')
    .eq('measurement_id', measurement_id)
    .eq('group_id', group_id)
    .eq('onderdeel', onderdeel)
    .eq('behandeling', behandeling)
    .maybeSingle()

  if (totaal <= 0) {
    if (bestaand) {
      await supabase.from('paint_measurement_aggregates').delete().eq('id', bestaand.id)
    }
    return
  }

  await supabase
    .from('paint_measurement_aggregates')
    .upsert(
      {
        ...(bestaand?.id ? { id: bestaand.id } : {}),
        project_id,
        measurement_id,
        group_id,
        onderdeel,
        type,
        behandeling,
        aggregate_key,
        quantity: totaal,
        unit,
        calculation_line_id: bestaand?.calculation_line_id ?? null,
        updated_at: nu,
      },
      { onConflict: 'id' }
    )
}

// ─── Sync naar calculatieregels ───────────────────────────────────────────────

export async function syncNaarCalculatie(
  meetstaatId: string,
  projectId: string
): Promise<{ aangemaakt: number; bijgewerkt: number }> {
  const supabase = await createClient()

  const { data: aggregaten, error } = await supabase
    .from('paint_measurement_aggregates')
    .select('*')
    .eq('measurement_id', meetstaatId)
    .gt('quantity', 0)

  if (error) throw new Error(`Fout bij ophalen aggregaten: ${error.message}`)

  let aangemaakt = 0
  let bijgewerkt = 0
  const nu = new Date().toISOString()

  for (const agg of aggregaten) {
    const description = [agg.onderdeel, agg.type, agg.behandeling]
      .filter(Boolean)
      .join(' - ')

    if (agg.calculation_line_id) {
      // Bijwerken bestaande calculatieregel
      await supabase
        .from('calculation_lines')
        .update({
          description,
          quantity: agg.quantity,
          unit:     agg.unit,
          updated_at: nu,
        })
        .eq('id', agg.calculation_line_id)
      bijgewerkt++
    } else {
      // Nieuwe calculatieregel aanmaken
      const { data: nieuweRegel, error: regelErr } = await supabase
        .from('calculation_lines')
        .insert({
          project_id:          projectId,
          group_id:            agg.group_id,
          source_type:         'paint_measurement',
          source_aggregate_id: agg.id,
          description,
          quantity:            agg.quantity,
          unit:                agg.unit,
        })
        .select('id')
        .single()

      if (regelErr) throw new Error(`Fout bij aanmaken calculatieregel: ${regelErr.message}`)

      // Koppel aggregaat aan calculatieregel
      await supabase
        .from('paint_measurement_aggregates')
        .update({ calculation_line_id: nieuweRegel.id, updated_at: nu })
        .eq('id', agg.id)

      aangemaakt++
    }
  }

  // Meetstaat als gesynchroniseerd markeren
  await supabase
    .from('paint_measurements')
    .update({ status: 'gesynchroniseerd', updated_at: nu })
    .eq('id', meetstaatId)

  revalidatePath('/projecten/[id]/calculatie', 'page')
  revalidatePath('/projecten/[id]/meetstaat', 'page')

  return { aangemaakt, bijgewerkt }
}
