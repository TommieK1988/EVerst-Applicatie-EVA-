/**
 * sync-utils.ts — Client-side hulpfuncties om localStorage calculatiedata
 * voor te bereiden voor sync naar Supabase.
 */

import {
  getGroepen,
  getCalculatieregelsVoorScenario,
  getComponentregelsVoorScenario,
} from '@/lib/everts-calc/local-store'
import { berekenCalculatieregel, berekeningNummers } from '@/lib/everts-calc/calculations'
import type { SyncGroep, SyncRegel } from '@/app/(platform)/everts-calc/actions/sync'

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

  const syncRegels: SyncRegel[] = regels.map(r => {
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
