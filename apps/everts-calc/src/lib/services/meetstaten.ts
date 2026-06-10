/**
 * Meetstaten service — schildermeetstaat data ophalen
 */
import { createClient } from '@/lib/supabase/server'
import type {
  DbPaintMeasurement,
  DbMeasurementLine,
  DbMeasurementAggregate,
} from '@/lib/supabase/database.types'

// ─── Meetstaten ───────────────────────────────────────────────────────────────

export async function getMeetstaten(projectId: string): Promise<DbPaintMeasurement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('paint_measurements')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Fout bij ophalen meetstaten: ${error.message}`)
  return data
}

export async function getMeetstaat(id: string): Promise<DbPaintMeasurement | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('paint_measurements')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen meetstaat: ${error.message}`)
  }
  return data
}

// ─── Meetregels ───────────────────────────────────────────────────────────────

export async function getMeetregels(
  meetstaatId: string,
  groepId?: string
): Promise<DbMeasurementLine[]> {
  const supabase = await createClient()
  let query = supabase
    .from('paint_measurement_lines')
    .select('*')
    .eq('measurement_id', meetstaatId)
    .order('line_no', { ascending: true })

  if (groepId) {
    query = query.eq('group_id', groepId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Fout bij ophalen meetregels: ${error.message}`)
  return data
}

// ─── Aggregaten ───────────────────────────────────────────────────────────────

export async function getMeetregelAggregaten(
  meetstaatId: string,
  groepId?: string
): Promise<DbMeasurementAggregate[]> {
  const supabase = await createClient()
  let query = supabase
    .from('paint_measurement_aggregates')
    .select('*')
    .eq('measurement_id', meetstaatId)
    .gt('quantity', 0)

  if (groepId) {
    query = query.eq('group_id', groepId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Fout bij ophalen meetregel aggregaten: ${error.message}`)
  return data
}
