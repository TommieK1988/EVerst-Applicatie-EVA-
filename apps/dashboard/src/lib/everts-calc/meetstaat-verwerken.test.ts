import { describe, it, expect } from 'vitest'
import { teVerwerken, isVervallen, meetstaatStatus } from './meetstaat-verwerken'
import type { MeetregelAggregaat } from './types'

const agg = (x: Partial<MeetregelAggregaat>): MeetregelAggregaat => ({
  id: 'a', meetstaat_id: 'ms', groep_id: 'g', onderdeel: 'Kozijnen hout', type: '', behandeling: '',
  totaal_hoeveelheid: 0, eenheid: 'm¹', is_gesynchroniseerd: false, aangepast_op: '', ...x,
})

describe('teVerwerken', () => {
  it('neemt nieuwe en gewijzigde codes mee', () => {
    const nieuw = agg({ id: 'n', totaal_hoeveelheid: 12 })
    const gewijzigd = agg({ id: 'g', totaal_hoeveelheid: 12, calculatieregel_id: 'R1' })
    expect(teVerwerken([nieuw, gewijzigd]).map(a => a.id)).toEqual(['n', 'g'])
  })

  it('neemt een code die naar 0 zakte mee als hij al in de calculatie staat', () => {
    const vervallen = agg({ totaal_hoeveelheid: 0, calculatieregel_id: 'R1' })
    expect(teVerwerken([vervallen])).toHaveLength(1)
    expect(isVervallen(vervallen)).toBe(true)
  })

  it('laat een vervallen code liggen als zijn calculatieregel al weg is', () => {
    const vervallen = agg({ totaal_hoeveelheid: 0, calculatieregel_id: 'R1' })
    expect(teVerwerken([vervallen], new Set(['R2']))).toEqual([])
    expect(teVerwerken([vervallen], new Set(['R1']))).toHaveLength(1)
  })

  it('zet een regel niet op 0 als een actieve code er ook naar wijst', () => {
    const oud = agg({ id: 'oud', totaal_hoeveelheid: 0, calculatieregel_id: 'R1' })
    const nieuw = agg({ id: 'nieuw', totaal_hoeveelheid: 12, calculatieregel_id: 'R1', is_gesynchroniseerd: true })
    expect(teVerwerken([oud, nieuw], new Set(['R1']))).toEqual([])
  })

  it('laat een 0-code zonder calculatieregel en alles wat al verwerkt is liggen', () => {
    expect(teVerwerken([
      agg({ totaal_hoeveelheid: 0 }),
      agg({ totaal_hoeveelheid: 12, calculatieregel_id: 'R1', is_gesynchroniseerd: true }),
      agg({ totaal_hoeveelheid: 0, calculatieregel_id: 'R2', is_gesynchroniseerd: true }),
    ])).toEqual([])
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
