import { describe, it, expect } from 'vitest'
import { naarCalculatie, telPerStatus } from './naar-calculatie'
import type { MeetregelAggregaat } from './types'

const agg = (x: Partial<MeetregelAggregaat>): MeetregelAggregaat => ({
  id: 'a', meetstaat_id: 'ms', groep_id: 'g', onderdeel: 'Houten kozijn', type: '', behandeling: '',
  totaal_hoeveelheid: 0, eenheid: 'm¹', is_gesynchroniseerd: false, aangepast_op: '', ...x,
})

describe('naarCalculatie', () => {
  const regels = new Map([['R1', 158.4], ['R2', 15.84], ['R3', 18]])

  it('zet elke code naast de calculatie: gelijk, gewijzigd, nieuw, vervallen', () => {
    const rijen = naarCalculatie([
      agg({ id: 'gelijk', bestekcode: 'S-01', totaal_hoeveelheid: 158.4, calculatieregel_id: 'R1' }),
      agg({ id: 'gewijzigd', bestekcode: 'S-02', totaal_hoeveelheid: 27.72, calculatieregel_id: 'R2' }),
      agg({ id: 'nieuw', bestekcode: 'S-03', totaal_hoeveelheid: 47.99 }),
      agg({ id: 'vervallen', bestekcode: 'S-06', totaal_hoeveelheid: 0, calculatieregel_id: 'R3' }),
    ], new Set(['gewijzigd', 'nieuw', 'vervallen']), regels)

    expect(rijen.map(r => [r.aggregaat.id, r.status])).toEqual([
      ['vervallen', 'vervallen'], ['nieuw', 'nieuw'], ['gewijzigd', 'gewijzigd'], ['gelijk', 'gelijk'],
    ])
    expect(rijen.find(r => r.status === 'gewijzigd')?.verschil).toBeCloseTo(11.88)
    expect(rijen.find(r => r.status === 'vervallen')).toMatchObject({ nu: 18, wordt: 0, verschil: -18 })
    expect(rijen.find(r => r.status === 'nieuw')).toMatchObject({ nu: null, verschil: 47.99 })
    expect(telPerStatus(rijen)).toEqual({ vervallen: 1, nieuw: 1, gewijzigd: 1, gelijk: 1 })
  })

  it('laat een vervallen code weg als hij niets meer verandert', () => {
    const weg = agg({ id: 'v', totaal_hoeveelheid: 0, calculatieregel_id: 'R9' })   // regel bestaat niet
    const verwerkt = agg({ id: 'w', totaal_hoeveelheid: 0, calculatieregel_id: 'R3' }) // niet meer open
    expect(naarCalculatie([weg, verwerkt], new Set(['v']), regels)).toEqual([])
  })

  it('afronding is geen wijziging', () => {
    const [rij] = naarCalculatie([agg({ totaal_hoeveelheid: 158.4001, calculatieregel_id: 'R1' })], new Set(), regels)
    expect(rij.status).toBe('gelijk')
  })
})
