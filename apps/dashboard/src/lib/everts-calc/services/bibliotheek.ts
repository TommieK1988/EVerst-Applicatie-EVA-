/**
 * Bibliotheek service — schildernormen ophalen vanuit Supabase
 */
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { DbPaintItem, DbPaintTreatment, DbPaintSystemFamily } from '@/lib/everts-calc/supabase/database.types'

// ─── Uitgebreide types met geneste data ───────────────────────────────────────

export interface LaborNorm {
  id: string
  treatment_id: string
  hours_per_unit: number
  hour_rate: number
  cost_per_unit: number
  unit: string
  active: boolean
  source_code: string | null
  description: string | null
}

export interface MaterialNorm {
  id: string
  treatment_id: string
  material_name: string | null
  material_code: string | null
  unit: string
  quantity_per_unit: number
  unit_price: number
  cost_per_unit: number
  active: boolean
  norm_type: string
}

export interface PaintItemMetNormen extends DbPaintItem {
  family: Pick<DbPaintSystemFamily, 'id' | 'name' | 'family_code'> | null
  labor_norms: LaborNorm[]
  material_norms: MaterialNorm[]
  /**
   * Recept is een spiegel van de Schilderwerkbibliotheek en hier alleen-lezen;
   * een database-trigger schrijft het bij elke bronwijziging opnieuw.
   * Staat nog niet in de gegenereerde `database.types.ts`.
   */
  vergrendeld: boolean
  schilder_combinatie_id: string | null
  /**
   * De schilderbehandeling achter dit recept. Wordt bij het toevoegen aan een
   * calculatie gekoppeld in plaats van de werkomschrijving te kopiëren, zodat de
   * tekst live blijft tot hij bij de offerte bevriest.
   */
  schilder_behandeling_id: string | null
  /** Code van die behandeling ("OHD 03") — waar de receptenzoeker op zoekt. */
  behandeling_code: string | null
}

// ─── Data ophalen ─────────────────────────────────────────────────────────────

export async function getBibliotheekItems(): Promise<PaintItemMetNormen[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('paint_items')
    .select(`
      *,
      family:paint_system_families (id, name, family_code),
      labor_norms:paint_labor_norms (
        id, treatment_id, hours_per_unit, hour_rate,
        cost_per_unit, unit, active, source_code, description
      ),
      material_norms:paint_material_norms (
        id, treatment_id, material_name, material_code,
        unit, quantity_per_unit, unit_price, cost_per_unit, active, norm_type
      )
    `)
    .eq('active', true)
    .order('onderdeel')
    .order('full_name')

  if (error) throw new Error(`Fout bij ophalen bibliotheek: ${error.message}`)
  return (data as unknown) as PaintItemMetNormen[]
}

export async function getBehandelingen(): Promise<DbPaintTreatment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('paint_treatments')
    .select('*')
    .eq('active', true)
    .order('name')

  if (error) throw new Error(`Fout bij ophalen behandelingen: ${error.message}`)
  return data
}
