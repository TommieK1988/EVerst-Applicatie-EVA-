/**
 * sync-utils.ts — Client-side hulpfuncties om de calculatiedata uit het
 * werkgeheugen voor te bereiden voor sync naar Supabase.
 */

import {
  getGroepen,
  getCalculatieregels,
  getComponentregels,
  getScenarios,
  getCalculatieregelsVoorScenario,
  getComponentregelsVoorScenario,
  getMeetstaten,
  getMeetregels,
  getMeetregelAggregaten,
} from '@/lib/everts-calc/local-store'
import { berekenCalculatieregel, berekeningNummers } from '@/lib/everts-calc/calculations'
import { isTekstregel } from '@/lib/everts-calc/types'
import type { SyncGroep, SyncRegel, CalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'

export function verzamelSyncData(scenarioId: string): {
  groepen: SyncGroep[]
  regels: SyncRegel[]
} {
  const groepen   = getGroepen(scenarioId)
  const regels    = getCalculatieregelsVoorScenario(scenarioId)
  const comps     = getComponentregelsVoorScenario(scenarioId)
  const nummers   = berekeningNummers(groepen)

  const syncGroepen: SyncGroep[] = groepen.map(g => ({
    id:              g.id,
    parent_group_id: g.parent_id,
    name:            g.naam,
    level:           g.niveau,
    sort_order:      g.volgorde,
    group_number:    nummers.get(g.id) ?? null,
  }))

  // Tekstregels blijven buiten de genormaliseerde projectie: die voedt de
  // werkbegroting en rapportage, en daar heeft een regel zonder bedrag niets
  // te zoeken. De verliesloze snapshot hieronder bewaart ze wél.
  const syncRegels: SyncRegel[] = regels.filter(r => !isTekstregel(r)).map(r => {
    const bedragen = berekenCalculatieregel(r, comps)
    return {
      id:               r.id,
      group_id:         r.groep_id,
      description:      r.omschrijving || '',
      quantity:         r.hoeveelheid,
      unit:             r.eenheid,
      labor_cost:       Math.round(bedragen.arbeid_totaal     * 100) / 100,
      material_cost:    Math.round(bedragen.materieel_totaal  * 100) / 100,
      subcontract_cost: Math.round(bedragen.oa_totaal         * 100) / 100,
      total_cost:       Math.round(bedragen.kp_totaal         * 100) / 100,
    }
  })

  return { groepen: syncGroepen, regels: syncRegels }
}

/**
 * Verzamelt het volledige, verliesloze calculatie-model van een project (alle
 * scenario's + hun groepen/regels/componenten, plus de meetstaten) uit het
 * werkgeheugen, voor opslag als JSONB-snapshot in Supabase. Zo kan de calculatie
 * op elk apparaat/elke gebruiker exact worden teruggeladen (zie hydrateCalculatie).
 */
export function verzamelCalculatieSnapshot(projectId: string): CalculatieSnapshot {
  const scenarios   = getScenarios(projectId)
  const scenarioIds = new Set(scenarios.map(s => s.id))
  const groepen     = getGroepen().filter(g => scenarioIds.has(g.scenario_id))
  const groepIds    = new Set(groepen.map(g => g.id))
  const regels      = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
  const regelIds    = new Set(regels.map(r => r.id))
  const componenten = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))

  // Meetstaten reizen mee: ze horen bij het project en hadden tot nu toe helemaal
  // geen plek in Supabase (ze stonden alleen op het apparaat waar ze gemaakt zijn).
  const meetstaten   = getMeetstaten().filter(m => m.project_id === projectId)
  const meetstaatIds = new Set(meetstaten.map(m => m.id))
  const meetregels   = getMeetregels().filter(r => meetstaatIds.has(r.meetstaat_id))
  const meetregel_aggregaten = getMeetregelAggregaten().filter(a => meetstaatIds.has(a.meetstaat_id))

  return { scenarios, groepen, regels, componenten, meetstaten, meetregels, meetregel_aggregaten }
}
