/**
 * Projecten service — server-side data-ophaling via Supabase
 */
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { DbProject } from '@/lib/everts-calc/supabase/database.types'

export async function getProjecten(): Promise<DbProject[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Fout bij ophalen projecten: ${error.message}`)
  return data
}

export async function getProject(id: string): Promise<DbProject | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen project: ${error.message}`)
  }
  return data
}
