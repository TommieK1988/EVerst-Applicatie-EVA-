'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'

// ─── Calculatieregels ─────────────────────────────────────────────────────────

export async function maakCalculatieregel(data: {
  project_id: string
  group_id: string
  description: string
  quantity?: number
  unit?: string
  source_type?: string | null
}): Promise<string> {
  const supabase = await createClient()
  const { data: regel, error } = await supabase
    .from('calculation_lines')
    .insert({
      project_id: data.project_id,
      group_id: data.group_id,
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      source_type: data.source_type ?? 'handmatig',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken calculatieregel: ${error.message}`)
  revalidatePath('/projecten/[id]/calculatie', 'page')
  return regel.id
}

export async function updateCalculatieregel(id: string, data: {
  description?: string
  quantity?: number
  unit?: string
  labor_hours?: number | null
  labor_rate?: number | null
  labor_cost?: number | null
  material_cost?: number | null
  equipment_cost?: number | null
  subcontract_cost?: number | null
  total_cost?: number | null
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('calculation_lines')
    .update({
      description:    data.description,
      quantity:       data.quantity,
      unit:           data.unit,
      labor_hours:    data.labor_hours    ?? undefined,
      labor_rate:     data.labor_rate     ?? undefined,
      labor_cost:     data.labor_cost     ?? undefined,
      material_cost:  data.material_cost  ?? undefined,
      equipment_cost: data.equipment_cost ?? undefined,
      subcontract_cost: data.subcontract_cost ?? undefined,
      total_cost:     data.total_cost,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken calculatieregel: ${error.message}`)
  revalidatePath('/projecten/[id]/calculatie', 'page')
}

export async function verwijderCalculatieregel(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('calculation_lines')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Fout bij verwijderen calculatieregel: ${error.message}`)
  revalidatePath('/projecten/[id]/calculatie', 'page')
}
