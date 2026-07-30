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
 * Uitgangspunt: **de server wint.** Een calculatie die al in Supabase staat wordt
 * nooit overschreven met de lokale kopie (die kan verouderd zijn). Alleen wat de
 * server niet heeft — meetstaten, en calculaties van projecten zonder snapshot —
 * wordt toegevoegd.
 */

import { laadCalculatieSnapshot, bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
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

export type OvernameResultaat = { projecten: number; meetstaten: number }

/**
 * Neemt de lokale calculatie-/meetstaatdata over naar Supabase en ruimt de oude
 * sleutels op. Gooit als een project niet weggeschreven kon worden — dan blijven
 * de sleutels staan zodat een volgende poging het opnieuw probeert.
 */
export async function neemLegacyCalculatieDataOver(): Promise<OvernameResultaat> {
  const scenarios   = leesLijst<Scenario>(BRON.scenarios)
  const groepen     = leesLijst<Groep>(BRON.groepen)
  const regels      = leesLijst<Calculatieregel>(BRON.calculatieregels)
  const componenten = leesLijst<Componentregel>(BRON.componentregels)
  const meetstaten  = leesLijst<Meetstaat>(BRON.meetstaten)
  const meetregels  = leesLijst<Meetregel>(BRON.meetregels)
  const aggregaten  = leesLijst<MeetregelAggregaat>(BRON.aggregaten)

  const projectIds = new Set<string>([
    ...scenarios.map(s => s.project_id),
    ...meetstaten.map(m => m.project_id),
  ].filter(Boolean))

  let overgenomenProjecten = 0
  let overgenomenMeetstaten = 0

  for (const projectId of projectIds) {
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
      throw new Error(res.fout ?? `Overnemen van project ${projectId} mislukt`)
    }

    if (calcOvergenomen) overgenomenProjecten++
    overgenomenMeetstaten += nieuweMeetstaten.length
  }

  // Pas opruimen als alles gelukt is.
  for (const sleutel of OP_TE_RUIMEN) {
    try { localStorage.removeItem(sleutel) } catch { /* geblokkeerd */ }
  }

  return { projecten: overgenomenProjecten, meetstaten: overgenomenMeetstaten }
}
