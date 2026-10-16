import { describe, it, expect } from 'vitest'
import { offerteBordKolom, offerteBordDoel, OFFERTE_BORD_KOLOMMEN } from './offerte-bord'
import { OFFERTE_STATUSSEN } from './types'

describe('offerteBord', () => {
  it('elke offertesubstatus valt in een van de vier kolommen', () => {
    const kolommen = new Set<string>(OFFERTE_BORD_KOLOMMEN.map(k => k.key))
    for (const s of OFFERTE_STATUSSEN) expect(kolommen.has(offerteBordKolom(s.key))).toBe(true)
  })

  it('actie en wachten zijn samen In gesprek', () => {
    expect(offerteBordKolom('nabellen')).toBe('in_gesprek')
    expect(offerteBordKolom('in_behandeling')).toBe('in_gesprek')
  })

  it('slepen naar Afgesloten vraagt eerst om een keuze', () => {
    expect(offerteBordDoel('afgesloten')).toBeNull()
    expect(offerteBordDoel('in_gesprek')).toBe('nabellen')
    expect(offerteBordDoel('mondelinge_toezegging')).toBe('mondelinge_toezegging')
  })
})
