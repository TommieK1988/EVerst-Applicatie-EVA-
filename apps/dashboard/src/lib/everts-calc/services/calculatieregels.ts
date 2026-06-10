/**
 * Calculatieregels service — server-side ophalen van regels
 */
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { DbCalculationLine } from '@/lib/everts-calc/supabase/database.types'

export async function getCalculatieregels(groepId: string): Promise<DbCalculationLine[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calculation_lines')
    .select('*')
    .eq('group_id', groepId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Fout bij ophalen calculatieregels: ${error.message}`)
  return data
}

export async function getCalculatieregelsVoorProject(
  projectId: string,
  groepIds?: string[]
): Promise<DbCalculationLine[]> {
  const supabase = await createClient()
  let query = supabase
    .from('calculation_lines')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (groepIds && groepIds.length > 0) {
    query = query.in('group_id', groepIds)
  }

  const { data, error } = await query
  if (error) throw new Error(`Fout bij ophalen calculatieregels: ${error.message}`)
  return data
}

export async function getCalculatieregel(id: string): Promise<DbCalculationLine | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calculation_lines')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen calculatieregel: ${error.message}`)
  }
  return data
}
