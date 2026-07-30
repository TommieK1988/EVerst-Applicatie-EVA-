'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'
import { createAdminClient } from '@everts/database/server'
import type {
  Scenario, Groep, Calculatieregel, Componentregel,
  Meetstaat, Meetregel, MeetregelAggregaat,
} from '@/lib/everts-calc/types'

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
  /** Meetstaten van dit project. Optioneel: snapshots van vóór juli 2026 hebben ze niet. */
  meetstaten?: Meetstaat[]
  meetregels?: Meetregel[]
  meetregel_aggregaten?: MeetregelAggregaat[]
}

/**
 * Beschermt bevroren (verzonden) scenario's tegen overschrijven. Een verzonden
 * offerte bevriest zijn calculatie (`bevroren_op` op het scenario in de blob).
 * Omdat alle versies van een project in één blob leven, kan een oude tab via de
 * autosave anders een verzonden versie stil overschrijven. Deze merge houdt elk
 * bevroren scenario (incl. groepen/regels/componenten) exact op de serverversie
 * en accepteert alleen wijzigingen aan niet-bevroren scenario's.
 */
// Niet geëxporteerd: dit is een 'use server'-bestand en mag alleen async
// server-actions exporteren. Interne (sync) helper voor bewaarCalculatieSnapshot.
function beschermBevrorenScenarios(
  server: CalculatieSnapshot,
  incoming: CalculatieSnapshot
): CalculatieSnapshot {
  const bevrorenScenarioIds = new Set(
    (server.scenarios ?? []).filter(s => s.bevroren_op).map(s => s.id)
  )
  if (bevrorenScenarioIds.size === 0) return incoming

  const bevrorenGroepIds = new Set(
    (server.groepen ?? []).filter(g => bevrorenScenarioIds.has(g.scenario_id)).map(g => g.id)
  )
  const bevrorenRegelIds = new Set(
    (server.regels ?? []).filter(r => bevrorenGroepIds.has(r.groep_id)).map(r => r.id)
  )

  return {
    scenarios: [
      ...incoming.scenarios.filter(s => !bevrorenScenarioIds.has(s.id)),
      ...server.scenarios.filter(s => bevrorenScenarioIds.has(s.id)),
    ],
    groepen: [
      ...incoming.groepen.filter(g => !bevrorenScenarioIds.has(g.scenario_id)),
      ...server.groepen.filter(g => bevrorenScenarioIds.has(g.scenario_id)),
    ],
    regels: [
      ...incoming.regels.filter(r => !bevrorenGroepIds.has(r.groep_id)),
      ...server.regels.filter(r => bevrorenGroepIds.has(r.groep_id)),
    ],
    componenten: [
      ...incoming.componenten.filter(c => !bevrorenRegelIds.has(c.calculatieregel_id)),
      ...server.componenten.filter(c => bevrorenRegelIds.has(c.calculatieregel_id)),
    ],
    // Meetstaten kennen geen bevriezing; de binnenkomende versie is leidend.
    meetstaten: incoming.meetstaten,
    meetregels: incoming.meetregels,
    meetregel_aggregaten: incoming.meetregel_aggregaten,
  }
}

/** Schrijft de volledige calculatie (alle scenario's van het project) als JSONB. */
export async function bewaarCalculatieSnapshot(
  projectId: string,
  snapshot: CalculatieSnapshot
): Promise<{ gelukt: boolean; fout?: string }> {
  // calculatie_snapshots staat (nog) niet in de gegenereerde types → any (zoals werkbegroting).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any

  // Herlaad de serverversie en bescherm bevroren scenario's tegen overschrijven.
  const { data: bestaand } = await db
    .from('calculatie_snapshots')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()
  const teSchrijven = bestaand?.data
    ? beschermBevrorenScenarios(bestaand.data as CalculatieSnapshot, snapshot)
    : snapshot

  const { error } = await db
    .from('calculatie_snapshots')
    .upsert(
      { project_id: projectId, data: teSchrijven, bijgewerkt_op: new Date().toISOString() },
      { onConflict: 'project_id' }
    )
  if (error) return { gelukt: false, fout: error.message }
  return { gelukt: true }
}

/** Bevroren calculatie-subboom zoals bewaard bij een verzonden offerteversie. */
export interface CalculatieVersieSnapshot {
  scenario: Scenario
  groepen: Groep[]
  regels: Calculatieregel[]
  componenten: Componentregel[]
}

/**
 * Bevriest de calculatie van een zojuist verzonden offerte: bewaart een
 * onveranderbare kopie van de scenario-subboom bij de offerteversie
 * (`calculatie_versie_snapshots`) én markeert het scenario bevroren in de live
 * blob. Fail-soft: zonder gekoppeld scenario/blob is er niets te bevriezen.
 */
export async function bevriesCalculatieVoorOfferte(
  quoteId: string
): Promise<{ gelukt: boolean; fout?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: q } = await admin
    .from('quotes')
    .select('scenario_id, project_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (!q?.scenario_id || !q?.project_id) return { gelukt: true }
  const scenarioId = q.scenario_id as string
  const projectId = q.project_id as string

  const { data: snap } = await admin
    .from('calculatie_snapshots')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()
  const blob = snap?.data as CalculatieSnapshot | undefined
  if (!blob) return { gelukt: true }

  const scenario = blob.scenarios.find(s => s.id === scenarioId)
  if (!scenario) return { gelukt: true }

  const groepen = blob.groepen.filter(g => g.scenario_id === scenarioId)
  const groepIds = new Set(groepen.map(g => g.id))
  const regels = blob.regels.filter(r => groepIds.has(r.groep_id))
  const regelIds = new Set(regels.map(r => r.id))
  const componenten = blob.componenten.filter(c => regelIds.has(c.calculatieregel_id))
  const nu = new Date().toISOString()

  // Onveranderbare kopie bij de offerteversie.
  await admin.from('calculatie_versie_snapshots').upsert(
    {
      quote_id: quoteId,
      scenario_id: scenarioId,
      project_id: projectId,
      data: { scenario: { ...scenario, bevroren_op: nu }, groepen, regels, componenten },
      bevroren_op: nu,
    },
    { onConflict: 'quote_id' }
  )

  // Markeer het scenario bevroren in de live blob (direct, read-modify-write).
  const nieuweScenarios = blob.scenarios.map(s =>
    s.id === scenarioId ? { ...s, bevroren_op: nu } : s
  )
  await admin
    .from('calculatie_snapshots')
    .update({ data: { ...blob, scenarios: nieuweScenarios }, bijgewerkt_op: nu })
    .eq('project_id', projectId)

  return { gelukt: true }
}

/** Laadt de bevroren calculatie-subboom van een verzonden offerte (of null). */
export async function laadCalculatieVersieSnapshot(
  quoteId: string
): Promise<CalculatieVersieSnapshot | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data } = await admin
    .from('calculatie_versie_snapshots')
    .select('data')
    .eq('quote_id', quoteId)
    .maybeSingle()
  return (data?.data as CalculatieVersieSnapshot) ?? null
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
