'use client'

/**
 * Eenmalige overname van calculatiedata die nog in localStorage staat.
 *
 * De calculatiemodule werkte tot juli 2026 op localStorage. De calculatie zelf werd
 * al naar Supabase gesynct, maar de **meetstaten** niet: die bestonden alleen op het
 * apparaat waar ze gemaakt waren. Nu de module volledig op Supabase draait, zou die
 * data onzichtbaar worden. Deze module tilt hem eenmalig over en ruimt de oude
 * sleutels daarna op.
 *
 * Twee uitgangspunten:
 * - **De server wint.** Een calculatie die al in Supabase staat wordt nooit
 *   overschreven met de lokale kopie (die kan verouderd zijn). Alleen wat de server
 *   niet heeft — meetstaten, en calculaties van projecten zonder snapshot — wordt
 *   toegevoegd.
 * - **Er gaat niets verloren.** Een browser uit die tijd bevat vrijwel altijd resten
 *   van projecten die intussen verwijderd zijn, plus synthetische id's
 *   (`wb-direct-…`) van werkbegrotingen zonder calculatie. Daar is geen project meer
 *   om ze aan te hangen — `calculatie_snapshots.project_id` verwijst met een foreign
 *   key naar `projects`. Die resten worden overgeslagen en bewaard onder
 *   `evc_niet_overgezet`, zodat ze terug te halen zijn maar niet elke sessie opnieuw
 *   een foutmelding opleveren.
 */

import {
  laadCalculatieSnapshot, bewaarCalculatieSnapshot, filterBestaandeProjecten,
} from '@/app/(platform)/everts-calc/actions/sync'
import type {
  Scenario, Groep, Calculatieregel, Componentregel,
  Meetstaat, Meetregel, MeetregelAggregaat,
} from './types'

/** Sleutels met data die we overnemen. */
const BRON = {
  scenarios:        'evc_scenarios',
  groepen:          'evc_groepen',
  calculatieregels: 'evc_calculatieregels',
  componentregels:  'evc_componentregels',
  meetstaten:       'evc_meetstaten',
  meetregels:       'evc_meetregels',
  aggregaten:       'evc_meetregel_aggregaten',
} as const

/** Bewaarplek voor wat niet overgezet kón worden (geen bestaand project meer). */
const RESTANT_KEY = 'evc_niet_overgezet'

/**
 * Alle oude sleutels die na de overname weg mogen — inclusief de structuur van de
 * allereerste versie (projecten/locaties/elementen/activiteiten), de werkbegroting
 * (die al per dossier in Supabase staat) en de instellingen-spiegel.
 */
const OP_TE_RUIMEN = [
  ...Object.values(BRON),
  'evc_projecten', 'evc_deelprojecten', 'evc_locaties', 'evc_elementen',
  'evc_activiteiten', 'evc_lijnen', 'evc_bibliotheek', 'evc_projectvolgnummer',
  'evc_werkbegrotingen', 'evc_werkbegroting_regels', 'evc_werkbegroting_componenten',
  'evc_werkbegroting_wijzigingen', 'evc_werkbegroting_bestellingen',
  'evc_instellingen',
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function leesLijst<T>(sleutel: string): T[] {
  try {
    const raw = localStorage.getItem(sleutel)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? (data as T[]) : []
  } catch { return [] }
}

/** Staat er nog iets in localStorage dat overgenomen moet worden? */
export function heeftLegacyCalculatieData(): boolean {
  if (typeof window === 'undefined') return false
  return OP_TE_RUIMEN.some(k => {
    try { return localStorage.getItem(k) !== null } catch { return false }
  })
}

export type OvernameResultaat = {
  /** Aantal calculaties dat de server nog niet had en nu is overgezet. */
  projecten: number
  /** Aantal meetstaten dat is overgezet. */
  meetstaten: number
  /** Aantal projecten dat niet meer in EVA bestaat en dus niet overgezet kon worden. */
  overgeslagen: number
}

/**
 * Neemt de lokale calculatie-/meetstaatdata over naar Supabase en ruimt de oude
 * sleutels op. Gooit alleen bij een probleem dat later wél kan lukken (geen
 * verbinding, geen rechten); dan blijft alles staan voor een volgende poging.
 */
export async function neemLegacyCalculatieDataOver(): Promise<OvernameResultaat> {
  const scenarios   = leesLijst<Scenario>(BRON.scenarios)
  const groepen     = leesLijst<Groep>(BRON.groepen)
  const regels      = leesLijst<Calculatieregel>(BRON.calculatieregels)
  const componenten = leesLijst<Componentregel>(BRON.componentregels)
  const meetstaten  = leesLijst<Meetstaat>(BRON.meetstaten)
  const meetregels  = leesLijst<Meetregel>(BRON.meetregels)
  const aggregaten  = leesLijst<MeetregelAggregaat>(BRON.aggregaten)

  const alleProjectIds = [...new Set([
    ...scenarios.map(s => s.project_id),
    ...meetstaten.map(m => m.project_id),
  ].filter(Boolean))]

  // Synthetische id's (wb-direct-…) zijn geen uuid en horen bij een werkbegroting
  // zonder calculatie — daar hoort per definitie geen snapshot bij.
  const kandidaten = alleProjectIds.filter(id => UUID.test(id))
  // Kan gooien (verbinding/rechten) — dan stoppen we en blijft alles bewaard.
  const bestaande = new Set(await filterBestaandeProjecten(kandidaten))
  const onbekend = alleProjectIds.filter(id => !bestaande.has(id))

  let overgenomenProjecten = 0
  let overgenomenMeetstaten = 0

  for (const projectId of bestaande) {
    const server = await laadCalculatieSnapshot(projectId)

    // Lokale calculatie van dit project afbakenen.
    const lokaleScenarios = scenarios.filter(s => s.project_id === projectId)
    const scenarioIds     = new Set(lokaleScenarios.map(s => s.id))
    const lokaleGroepen   = groepen.filter(g => scenarioIds.has(g.scenario_id))
    const groepIds        = new Set(lokaleGroepen.map(g => g.id))
    const lokaleRegels    = regels.filter(r => groepIds.has(r.groep_id))
    const regelIds        = new Set(lokaleRegels.map(r => r.id))
    const lokaleComps     = componenten.filter(c => regelIds.has(c.calculatieregel_id))

    // Lokale meetstaten van dit project.
    const lokaleMeetstaten = meetstaten.filter(m => m.project_id === projectId)
    const lokaleMsIds      = new Set(lokaleMeetstaten.map(m => m.id))
    const lokaleMeetregels = meetregels.filter(r => lokaleMsIds.has(r.meetstaat_id))
    const lokaleAggregaten = aggregaten.filter(a => lokaleMsIds.has(a.meetstaat_id))

    // Server wint voor de calculatie; alleen bij een ontbrekende snapshot nemen we
    // de lokale calculatie over.
    const basis = server ?? {
      scenarios: lokaleScenarios, groepen: lokaleGroepen,
      regels: lokaleRegels, componenten: lokaleComps,
    }
    const calcOvergenomen = server === null && lokaleScenarios.length > 0

    // Meetstaten samenvoegen: wat de server al kent blijft staan.
    const bestaandeMsIds = new Set((basis.meetstaten ?? []).map(m => m.id))
    const nieuweMeetstaten = lokaleMeetstaten.filter(m => !bestaandeMsIds.has(m.id))
    const nieuweMsIds = new Set(nieuweMeetstaten.map(m => m.id))

    if (!calcOvergenomen && nieuweMeetstaten.length === 0) continue

    const res = await bewaarCalculatieSnapshot(projectId, {
      ...basis,
      meetstaten: [...(basis.meetstaten ?? []), ...nieuweMeetstaten],
      meetregels: [
        ...(basis.meetregels ?? []),
        ...lokaleMeetregels.filter(r => nieuweMsIds.has(r.meetstaat_id)),
      ],
      meetregel_aggregaten: [
        ...(basis.meetregel_aggregaten ?? []),
        ...lokaleAggregaten.filter(a => nieuweMsIds.has(a.meetstaat_id)),
      ],
    })
    if (!res.gelukt) {
      // Onverwacht: het project bestaat wél. Alles laten staan en later opnieuw.
      throw new Error(res.fout ?? `Overnemen van project ${projectId} mislukt`)
    }

    if (calcOvergenomen) overgenomenProjecten++
    overgenomenMeetstaten += nieuweMeetstaten.length
  }

  // Wat bij een verdwenen project hoort apart wegzetten in plaats van weggooien.
  if (onbekend.length > 0) {
    const onbekendSet = new Set(onbekend)
    const restScenarios = scenarios.filter(s => onbekendSet.has(s.project_id))
    const restScenarioIds = new Set(restScenarios.map(s => s.id))
    const restGroepen = groepen.filter(g => restScenarioIds.has(g.scenario_id))
    const restGroepIds = new Set(restGroepen.map(g => g.id))
    const restRegels = regels.filter(r => restGroepIds.has(r.groep_id))
    const restRegelIds = new Set(restRegels.map(r => r.id))
    const restMeetstaten = meetstaten.filter(m => onbekendSet.has(m.project_id))
    const restMsIds = new Set(restMeetstaten.map(m => m.id))
    try {
      localStorage.setItem(RESTANT_KEY, JSON.stringify({
        bewaard_op: new Date().toISOString(),
        reden: 'Deze projecten bestaan niet meer in EVA; er is geen calculatie om ze aan te koppelen.',
        projecten: onbekend,
        scenarios: restScenarios,
        groepen: restGroepen,
        regels: restRegels,
        componenten: componenten.filter(c => restRegelIds.has(c.calculatieregel_id)),
        meetstaten: restMeetstaten,
        meetregels: meetregels.filter(r => restMsIds.has(r.meetstaat_id)),
        meetregel_aggregaten: aggregaten.filter(a => restMsIds.has(a.meetstaat_id)),
      }))
    } catch { /* quota vol: dan blijven de originele sleutels staan */ }
  }

  for (const sleutel of OP_TE_RUIMEN) {
    try { localStorage.removeItem(sleutel) } catch { /* geblokkeerd */ }
  }

  return {
    projecten: overgenomenProjecten,
    meetstaten: overgenomenMeetstaten,
    overgeslagen: onbekend.length,
  }
}
