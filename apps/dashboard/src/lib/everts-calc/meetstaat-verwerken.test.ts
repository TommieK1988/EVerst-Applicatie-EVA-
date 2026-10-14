import { describe, it, expect } from 'vitest'
import { teVerwerken, isVervallen, meetstaatStatus } from './meetstaat-verwerken'
import type { MeetregelAggregaat } from './types'

const agg = (x: Partial<MeetregelAggregaat>): MeetregelAggregaat => ({
  id: 'a', meetstaat_id: 'ms', groep_id: 'g', onderdeel: 'Kozijnen hout', type: '', behandeling: '',
  totaal_hoeveelheid: 0, eenheid: 'm¹', is_gesynchroniseerd: false, aangepast_op: '', ...x,
})

const ids = (as: MeetregelAggregaat[]) => as.map(a => a.id)

describe('teVerwerken', () => {
  const calc = new Map([['R1', 12], ['R2', 18], ['R0', 0]])

  it('nieuw: hoeveelheid zonder calculatieregel', () => {
    expect(ids(teVerwerken([agg({ id: 'n', totaal_hoeveelheid: 12 })], calc))).toEqual(['n'])
  })

  it('nieuw: de calculatieregel is in de calculatie verwijderd, ook als de code als verwerkt staat', () => {
    const terug = agg({ id: 't', totaal_hoeveelheid: 12, calculatieregel_id: 'weg', is_gesynchroniseerd: true })
    expect(ids(teVerwerken([terug], calc))).toEqual(['t'])
  })

  it('gewijzigd: calculatie wijkt af, gelijk: niets te doen', () => {
    expect(ids(teVerwerken([
      agg({ id: 'g', totaal_hoeveelheid: 15, calculatieregel_id: 'R1' }),
      agg({ id: 'z', totaal_hoeveelheid: 12.001, calculatieregel_id: 'R1', is_gesynchroniseerd: false }),
    ], calc))).toEqual(['g'])
  })

  it('vervallen: code op 0, calculatieregel nog niet', () => {
    const v = agg({ id: 'v', totaal_hoeveelheid: 0, calculatieregel_id: 'R2', is_gesynchroniseerd: true })
    expect(ids(teVerwerken([v], calc))).toEqual(['v'])
    expect(isVervallen(v)).toBe(true)
  })

  it('niet vervallen als de regel al weg is, al op 0 staat, of een actieve code hem gebruikt', () => {
    expect(teVerwerken([
      agg({ id: 'weg', totaal_hoeveelheid: 0, calculatieregel_id: 'X' }),
      agg({ id: 'nul', totaal_hoeveelheid: 0, calculatieregel_id: 'R0' }),
      agg({ id: 'oud', totaal_hoeveelheid: 0, calculatieregel_id: 'R1' }),
      agg({ id: 'actief', totaal_hoeveelheid: 12, calculatieregel_id: 'R1' }),
    ], calc)).toEqual([])
  })
})

describe('meetstaatStatus', () => {
  it('zet gesynchroniseerd terug naar concept zodra er iets openstaat', () => {
    expect(meetstaatStatus('gesynchroniseerd', 3)).toBe('concept')
  })

  it('laat de status staan als er niets openstaat, of als hij niet gesynchroniseerd was', () => {
    expect(meetstaatStatus('gesynchroniseerd', 0)).toBe('gesynchroniseerd')
    expect(meetstaatStatus('concept', 2)).toBe('concept')
    expect(meetstaatStatus('definitief', 2)).toBe('definitief')
  })
})
