import { createClient } from '@/lib/houtrotherstel/supabase/client'
import type { StandardRepair, StandardRepairForm } from '@/lib/houtrotherstel/types'

export async function getStandaardReparaties(
  search?: string,
  category?: string,
  activeOnly = true
): Promise<StandardRepair[]> {
  const supabase = createClient()

  let query = supabase
    .from('standard_repairs')
    .select(`
      *,
      standard_repair_materials(*)
    `)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (activeOnly) {
    query = query.eq('active', true)
  }

  if (category) {
    query = query.eq('category', category)
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,code.ilike.%${search}%,category.ilike.%${search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function getStandaardReparatie(id: string): Promise<StandardRepair | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('standard_repairs')
    .select(`
      *,
      standard_repair_materials(*)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createStandaardReparatie(
  form: StandardRepairForm
): Promise<StandardRepair> {
  const supabase = createClient()

  const { materials, ...repairData } = form

  // Bereken labor_cost
  const labor_cost = (repairData.labor_hours || 0) * (repairData.labor_rate || 0)
  const cost_price = labor_cost + (repairData.material_cost || 0)

  const { data, error } = await supabase
    .from('standard_repairs')
    .insert({
      ...repairData,
      labor_cost,
      cost_price,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Materialen invoegen als aanwezig
  if (materials && materials.length > 0) {
    const materialsToInsert = materials.map((m) => ({
      standard_repair_id: data.id,
      material_name: m.material_name,
      quantity: m.quantity,
      unit: m.unit,
      unit_cost: m.unit_cost,
    }))

    const { error: matError } = await supabase
      .from('standard_repair_materials')
      .insert(materialsToInsert)

    if (matError) throw new Error(matError.message)
  }

  return data
}

export async function updateStandaardReparatie(
  id: string,
  form: Partial<StandardRepairForm>
): Promise<StandardRepair> {
  const supabase = createClient()

  const { materials, ...repairData } = form

  // Herbereken kosten als arbeid of materiaal is gewijzigd
  if (repairData.labor_hours !== undefined || repairData.labor_rate !== undefined) {
    const currentData = await getStandaardReparatie(id)
    if (currentData) {
      const hours = repairData.labor_hours ?? currentData.labor_hours
      const rate = repairData.labor_rate ?? currentData.labor_rate
      const matCost = repairData.material_cost ?? currentData.material_cost
      repairData.labor_cost = hours * rate
      repairData.cost_price = repairData.labor_cost + matCost
    }
  }

  const { data, error } = await supabase
    .from('standard_repairs')
    .update(repairData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Materialen bijwerken als opgegeven
  if (materials !== undefined) {
    // Verwijder bestaande materialen
    await supabase
      .from('standard_repair_materials')
      .delete()
      .eq('standard_repair_id', id)

    // Voeg nieuwe toe
    if (materials.length > 0) {
      const materialsToInsert = materials.map((m) => ({
        standard_repair_id: id,
        material_name: m.material_name,
        quantity: m.quantity,
        unit: m.unit,
        unit_cost: m.unit_cost,
      }))

      await supabase.from('standard_repair_materials').insert(materialsToInsert)
    }
  }

  return data
}

export async function deleteStandaardReparatie(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('standard_repairs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function toggleStandaardReparatieActief(
  id: string,
  active: boolean
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('standard_repairs')
    .update({ active })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
