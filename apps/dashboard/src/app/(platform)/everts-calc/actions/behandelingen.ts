'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'

export async function maakBehandeling(data: {
  treatment_code: string
  name: string
  family_id?: string
}): Promise<string> {
  const supabase = await createClient()
  const { data: item, error } = await supabase
    .from('paint_treatments')
    .insert({
      treatment_code: data.treatment_code,
      treatment_index_code: data.treatment_code,
      name: data.name,
      family_id: data.family_id ?? '00000000-0000-0000-0000-000000000001',
      active: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken behandeling: ${error.message}`)
  revalidatePath('/bibliotheek/behandelingen')
  return item.id
}

export async function updateBehandeling(id: string, data: {
  treatment_code?: string
  name?: string
}): Promise<void> {
  const supabase = await createClient()
  const update: { treatment_code?: string; treatment_index_code?: string; name?: string } = {}
  if (data.treatment_code !== undefined) {
    update.treatment_code = data.treatment_code
    update.treatment_index_code = data.treatment_code
  }
  if (data.name !== undefined) update.name = data.name

  const { error } = await supabase.from('paint_treatments').update(update).eq('id', id)
  if (error) throw new Error(`Fout bij bijwerken behandeling: ${error.message}`)
  revalidatePath('/bibliotheek/behandelingen')
}

export async function toggleBehandelingActief(id: string, actief: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('paint_treatments').update({ active: actief }).eq('id', id)
  if (error) throw new Error(`Fout bij bijwerken behandeling: ${error.message}`)
  revalidatePath('/bibliotheek/behandelingen')
}

export async function verwijderBehandeling(id: string): Promise<void> {
  const supabase = await createClient()
  // Controleer of er items aan gekoppeld zijn
  const { count } = await supabase
    .from('paint_items')
    .select('id', { count: 'exact', head: true })
    .eq('treatment_id', id)

  if ((count ?? 0) > 0) {
    throw new Error(`Kan niet verwijderen: ${count} recepten gebruiken deze behandeling`)
  }

  const { error } = await supabase.from('paint_treatments').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen behandeling: ${error.message}`)
  revalidatePath('/bibliotheek/behandelingen')
}
