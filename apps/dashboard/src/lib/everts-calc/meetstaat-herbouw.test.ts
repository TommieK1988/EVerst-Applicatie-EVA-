import { describe, it, expect } from 'vitest'
import { afwijkendeSleutels, sleutelVanAggregaat, aggregaatSleutel } from './meetstaat-utils'
import type { Meetregel, MeetregelAggregaat } from './types'

const regel = (x: Partial<Meetregel>): Meetregel => ({
  id: 'r', meetstaat_id: 'ms', groep_id: 'g', volgorde: 1, aantal: 1, eenheid: 'm²',
  is_leeg: false, aangepast_op: '', onderdeel: 'Houten kozijn', type: '10-20cm', ...x,
})
const agg = (x: Partial<MeetregelAggregaat>): MeetregelAggregaat => ({
  id: 'a', meetstaat_id: 'ms', groep_id: 'g', onderdeel: 'Houten kozijn', type: '10-20cm', behandeling: '',
  totaal_hoeveelheid: 0, eenheid: 'm²', is_gesynchroniseerd: true, aangepast_op: '', ...x,
})

describe('afwijkendeSleutels', () => {
  it('een aggregaat zonder meetregels meer (oude behandeling) moet naar 0', () => {
    const oud = agg({ behandeling: 'OHD 53', totaal_hoeveelheid: 352.188 })
    const nu = regel({ bestekcode: '2,5', breedte: 2, hoogte: 3 })
    const k = afwijkendeSleutels([nu], [oud, agg({ id: 'b', bestekcode: '2,5', totaal_hoeveelheid: 6 })])
    expect(k).toEqual([sleutelVanAggregaat(oud)])
  })

  it('een meetregel zonder aggregaat krijgt er een', () => {
    const r = regel({ bestekcode: 'S-01', breedte: 1, hoogte: 2 })
    expect(afwijkendeSleutels([r], [])).toEqual([aggregaatSleutel(r)])
  })

  it('niets als alles klopt', () => {
    const r = regel({ bestekcode: 's-01', breedte: 1, hoogte: 2 })
    expect(afwijkendeSleutels([r], [agg({ bestekcode: 'S-01', totaal_hoeveelheid: 2 })])).toEqual([])
  })
})
