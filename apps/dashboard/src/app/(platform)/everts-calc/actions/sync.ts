'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { Scenario, Groep, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncGroep {
  id: string
  parent_group_id: string | null
  name: string
  level: number
  sort_order: number
  group_number: string | null
}

export interface SyncRegel {
  id: string
  group_id: string
  description: string
  quantity: number
  unit: string
  labor_cost: number
  material_cost: number
  subcontract_cost: number
  total_cost: number
  kostengroep?: string
}

export interface SyncResultaat {
  gelukt: boolean
  groepen_geschreven: number
  regels_geschreven: number
  fout?: string
}

// ─── Hoofd sync functie ───────────────────────────────────────────────────────

export async function syncCalculatieNaarSupabase(
  projectId: string,
  groepen: SyncGroep[],
  regels: SyncRegel[]
): Promise<SyncResultaat> {
  const supabase = await createClient()
  const nu = new Date().toISOString()

  try {
    // 1. Upsert alle groepen (lokale UUID = Supabase UUID)
    if (groepen.length > 0) {
      const { error: groepErr } = await supabase
        .from('calculation_groups')
        .upsert(
          groepen.map(g => ({
            id:              g.id,
            project_id:      projectId,
            parent_group_id: g.parent_group_id,
            name:            g.name,
            level:           g.level,
            sort_order:      g.sort_order,
            group_number:    g.group_number,
            updated_at:      nu,
          })),
          { onConflict: 'id' }
        )

      if (groepErr) throw new Error(`Groepen sync mislukt: ${groepErr.message}`)
    }

    // 2. Upsert alle calculatieregels (lokale UUID = Supabase UUID)
    if (regels.length > 0) {
      const { error: regelErr } = await supabase
        .from('calculation_lines')
        .upsert(
          regels.map(r => ({
            id:               r.id,
            project_id:       projectId,
            group_id:         r.group_id,
            source_type:      'manual',
            description:      r.description || '(naamloos)',
            quantity:         r.quantity,
            unit:             r.unit || 'st',
            labor_cost:       r.labor_cost,
            material_cost:    r.material_cost,
            equipment_cost:   0,
            subcontract_cost: r.subcontract_cost,
            // total_cost is een GENERATED-kolom in Supabase
            // (labor_cost + material_cost + equipment_cost + subcontract_cost) —
            // niet zelf schrijven, anders faalt de upsert.
            kostengroep:      r.kostengroep ?? null,
            updated_at:       nu,
          })),
          { onConflict: 'id' }
        )

      if (regelErr) throw new Error(`Regels sync mislukt: ${regelErr.message}`)
    }

    // 3. Verwijder Supabase-regels die niet meer in localStorage staan
    const regelIds = regels.map(r => r.id)
    if (regelIds.length > 0) {
      await supabase
        .from('calculation_lines')
        .delete()
        .eq('project_id', projectId)
        .eq('source_type', 'manual')
        .not('id', 'in', `(${regelIds.map(id => `"${id}"`).join(',')})`)
    }

    revalidatePath(`/projecten/${projectId}`)
    revalidatePath(`/projecten/${projectId}/calculatie`)

    return {
      gelukt: true,
      groepen_geschreven: groepen.length,
      regels_geschreven: regels.length,
    }
  } catch (err) {
    return {
      gelukt: false,
      groepen_geschreven: 0,
      regels_geschreven: 0,
      fout: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

// ─── Verliesloze editor-snapshot (cross-device / gedeeld) ─────────────────────
//
// De genormaliseerde upsert hierboven is een *platgeslagen* projectie voor de
// werkbegroting/rapportage en verliest de rijke editor-velden (werkomschrijving,
// opslag/BTW per regel, schilderbehandeling, afbeeldingen, scenario-opslagen,
// betalingsconditie, componenten…). Om de calculatie op elk apparaat/elke
// gebruiker exact terug te kunnen laden bewaren we het volledige localStorage-
// model verliesloos als JSONB per project (bron van waarheid voor de editor).

export interface CalculatieSnapshot {
  scenarios: Scenario[]
  groepen: Groep[]
  regels: Calculatieregel[]
  componenten: Componentregel[]
}

/** Schrijft de volledige calculatie (alle scenario's van het project) als JSONB. */
export async function bewaarCalculatieSnapshot(
  projectId: string,
  snapshot: CalculatieSnapshot
): Promise<{ gelukt: boolean; fout?: string }> {
  // calculatie_snapshots staat (nog) niet in de gegenereerde types → any (zoals werkbegroting).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any
  const { error } = await db
    .from('calculatie_snapshots')
    .upsert(
      { project_id: projectId, data: snapshot, bijgewerkt_op: new Date().toISOString() },
      { onConflict: 'project_id' }
    )
  if (error) return { gelukt: false, fout: error.message }
  return { gelukt: true }
}

/** Haalt de gedeelde calculatie-snapshot op; null als er nog nooit is opgeslagen. */
export async function laadCalculatieSnapshot(projectId: string): Promise<CalculatieSnapshot | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any
  const { data, error } = await db
    .from('calculatie_snapshots')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error || !data?.data) return null
  return data.data as CalculatieSnapshot
}
