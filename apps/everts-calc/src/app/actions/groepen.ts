'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function maakGroep(data: {
  project_id: string
  parent_group_id?: string | null
  name: string
  level?: number
  sort_order?: number
  group_number?: string | null
}): Promise<string> {
  const supabase = await createClient()
  const { data: groep, error } = await supabase
    .from('calculation_groups')
    .insert({
      project_id: data.project_id,
      name: data.name,
      level: data.level ?? 0,
      sort_order: data.sort_order,
      group_number: data.group_number,
      parent_group_id: data.parent_group_id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken groep: ${error.message}`)
  revalidatePath('/projecten/[id]/calculatie', 'page')
  return groep.id
}

export async function updateGroep(id: string, data: {
  name?: string
  sort_order?: number
  group_number?: string | null
  parent_group_id?: string | null
  level?: number
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('calculation_groups')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken groep: ${error.message}`)
  revalidatePath('/projecten/[id]/calculatie', 'page')
}

export async function verwijderGroep(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('calculation_groups')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Fout bij verwijderen groep: ${error.message}`)
  revalidatePath(`/projecten/${projectId}/calculatie`)
}

export async function herordenaGroepen(
  updates: { id: string; sort_order: number }[]
): Promise<void> {
  const supabase = await createClient()
  const nu = new Date().toISOString()

  await Promise.all(
    updates.map(u =>
      supabase
        .from('calculation_groups')
        .update({ sort_order: u.sort_order, updated_at: nu })
        .eq('id', u.id)
    )
  )

  revalidatePath('/projecten/[id]/calculatie', 'page')
}
