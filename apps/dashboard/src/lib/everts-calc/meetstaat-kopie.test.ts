import { describe, it, expect } from 'vitest'
import { kopieerMeetstaten } from './meetstaat-kopie'
import type { Meetstaat, Meetregel, MeetregelAggregaat, MeetstaatElement } from './types'

/**
 * Reviseren/kopiëren van een calculatie neemt de meetstaat mee, met alle verwijzingen
 * omgezet naar de groepen en regels van de kopie.
 */

const meetstaat = (id: string, scenario_id: string, x: Partial<Meetstaat> = {}): Meetstaat => ({
  id, project_id: 'p', scenario_id, naam: 'Meetstaat 1', code: 'MS-2026-001',
  status: 'gesynchroniseerd', aangemaakt_op: '', aangepast_op: '', ...x,
})
const meetregel = (id: string, meetstaat_id: string, groep_id: string): Meetregel => ({
  id, meetstaat_id, groep_id, volgorde: 1, aantal: 1, eenheid: 'm²', is_leeg: false, aangepast_op: '',
})
const aggregaat = (id: string, meetstaat_id: string, groep_id: string, calculatieregel_id?: string): MeetregelAggregaat => ({
  id, meetstaat_id, groep_id, onderdeel: 'Kozijn', type: 'Omtrek', behandeling: '',
  totaal_hoeveelheid: 4, eenheid: 'm¹', calculatieregel_id, is_gesynchroniseerd: !!calculatieregel_id, aangepast_op: '',
})
const element = (id: string, meetstaat_id: string): MeetstaatElement => ({
  id, meetstaat_id, naam: 'Kozijn A', regels: [], aangemaakt_op: '', aangepast_op: '',
})

function kopieer(over: Partial<Parameters<typeof kopieerMeetstaten>[0]> = {}) {
  let n = 0
  return kopieerMeetstaten({
    bronScenarioId: 's1',
    nieuwScenarioId: 's2',
    groepIdMap: new Map([['g1', 'G1']]),
    regelIdMap: new Map([['r1', 'R1']]),
    meetstaten: [meetstaat('ms1', 's1'), meetstaat('ms-ander', 's9')],
    meetregels: [meetregel('mr1', 'ms1', 'g1'), meetregel('mr-ander', 'ms-ander', 'g1')],
    aggregaten: [aggregaat('a1', 'ms1', 'g1', 'r1')],
    elementen: [element('e1', 'ms1'), element('e-ander', 'ms-ander')],
    maakId: () => `nieuw${++n}`,
    ...over,
  })
}

describe('kopieerMeetstaten', () => {
  it('kopieert alleen meetstaten van het bronscenario, naar het nieuwe scenario', () => {
    const uit = kopieer()
    expect(uit.meetstaten).toHaveLength(1)
    expect(uit.meetstaten[0]).toMatchObject({ scenario_id: 's2', naam: 'Meetstaat 1', status: 'gesynchroniseerd' })
    expect(uit.meetstaten[0].id).not.toBe('ms1')
  })

  it('zet meetregels, aggregaten en elementen om naar de nieuwe meetstaat, groep en regel', () => {
    const uit = kopieer()
    const msId = uit.meetstaten[0].id
    expect(uit.meetregels).toEqual([expect.objectContaining({ meetstaat_id: msId, groep_id: 'G1' })])
    expect(uit.aggregaten).toEqual([expect.objectContaining({
      meetstaat_id: msId, groep_id: 'G1', calculatieregel_id: 'R1', is_gesynchroniseerd: true,
    })])
    expect(uit.elementen).toEqual([expect.objectContaining({ meetstaat_id: msId, naam: 'Kozijn A' })])
    expect(uit.aggregaatIdMap.get('a1')).toBe(uit.aggregaten[0].id)
  })

  it('ontkoppelt een aggregaat waarvan de calculatieregel niet is meegekopieerd', () => {
    const uit = kopieer({ regelIdMap: new Map() })
    expect(uit.aggregaten[0]).toMatchObject({ calculatieregel_id: undefined, is_gesynchroniseerd: false })
    expect(uit.meetstaten[0].status).toBe('concept')
  })

  it('slaat regels over in een groep die niet in de kopie zit', () => {
    const uit = kopieer({ groepIdMap: new Map() })
    expect(uit.meetregels).toHaveLength(0)
    expect(uit.aggregaten).toHaveLength(0)
  })

  it('laat de bron ongewijzigd', () => {
    const regels = [meetregel('mr1', 'ms1', 'g1')]
    kopieer({ meetregels: regels })
    expect(regels[0]).toMatchObject({ id: 'mr1', meetstaat_id: 'ms1', groep_id: 'g1' })
  })
})
