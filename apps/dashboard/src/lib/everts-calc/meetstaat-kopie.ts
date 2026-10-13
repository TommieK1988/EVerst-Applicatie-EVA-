/**
 * meetstaat-kopie.ts — Meetstaten meekopiëren met een scenario (calculatie).
 *
 * Een meetstaat hangt aan één scenario (`scenario_id`) en verwijst via zijn
 * meetregels en aggregaten naar groepen en calculatieregels van dát scenario.
 * Bij reviseren of kopiëren krijgt de nieuwe versie daarom een eigen kopie, met
 * alle verwijzingen omgezet naar de groepen en regels van de kopie. Zonder dit zag
 * een revisie een lege meetstaat, of synchroniseerde hij in de (bevroren) bron.
 *
 * Puur: leest niets uit het werkgeheugen en schrijft niets; de aanroeper slaat op.
 */

import { nieuweId } from './utils'
import type { Meetstaat, Meetregel, MeetregelAggregaat, MeetstaatElement } from './types'

export interface MeetstaatKopieInvoer {
  bronScenarioId: string
  nieuwScenarioId: string
  /** Oude → nieuwe groep-id, zoals `kopieerScenario` hem opbouwt. */
  groepIdMap: Map<string, string>
  /** Oude → nieuwe calculatieregel-id. */
  regelIdMap: Map<string, string>
  meetstaten: Meetstaat[]
  meetregels: Meetregel[]
  aggregaten: MeetregelAggregaat[]
  elementen: MeetstaatElement[]
  maakId?: () => string
}

export interface MeetstaatKopie {
  meetstaten: Meetstaat[]
  meetregels: Meetregel[]
  aggregaten: MeetregelAggregaat[]
  elementen: MeetstaatElement[]
  /** Oude → nieuwe aggregaat-id; voor `meetstaat_aggregaat_id` op de gekopieerde calculatieregels. */
  aggregaatIdMap: Map<string, string>
}

export function kopieerMeetstaten(invoer: MeetstaatKopieInvoer): MeetstaatKopie {
  const { bronScenarioId, nieuwScenarioId, groepIdMap, regelIdMap, maakId = nieuweId } = invoer
  const uit: MeetstaatKopie = { meetstaten: [], meetregels: [], aggregaten: [], elementen: [], aggregaatIdMap: new Map() }

  for (const ms of invoer.meetstaten.filter(m => m.scenario_id === bronScenarioId)) {
    const nieuwMsId = maakId()
    let ontkoppeld = false

    // Een regel in een groep die niet meegekopieerd is, slaan we over: anders wijst
    // de kopie naar een groep van de bron.
    for (const r of invoer.meetregels) {
      const groepId = r.meetstaat_id === ms.id ? groepIdMap.get(r.groep_id) : undefined
      if (groepId) uit.meetregels.push({ ...r, id: maakId(), meetstaat_id: nieuwMsId, groep_id: groepId })
    }

    for (const a of invoer.aggregaten) {
      const groepId = a.meetstaat_id === ms.id ? groepIdMap.get(a.groep_id) : undefined
      if (!groepId) continue
      const regelId = a.calculatieregel_id ? regelIdMap.get(a.calculatieregel_id) : undefined
      // Bestaat de gekoppelde calculatieregel niet in de kopie, dan moet hij opnieuw
      // gesynchroniseerd worden in plaats van naar een regel van de bron te wijzen.
      if (a.calculatieregel_id && !regelId) ontkoppeld = true
      const nieuwAggId = maakId()
      uit.aggregaatIdMap.set(a.id, nieuwAggId)
      uit.aggregaten.push({
        ...a,
        id: nieuwAggId,
        meetstaat_id: nieuwMsId,
        groep_id: groepId,
        calculatieregel_id: regelId,
        is_gesynchroniseerd: a.is_gesynchroniseerd && !!regelId,
      })
    }

    for (const el of invoer.elementen) {
      if (el.meetstaat_id === ms.id) uit.elementen.push({ ...el, id: maakId(), meetstaat_id: nieuwMsId })
    }

    uit.meetstaten.push({
      ...ms,
      id: nieuwMsId,
      scenario_id: nieuwScenarioId,
      status: ontkoppeld && ms.status === 'gesynchroniseerd' ? 'concept' : ms.status,
    })
  }

  return uit
}
