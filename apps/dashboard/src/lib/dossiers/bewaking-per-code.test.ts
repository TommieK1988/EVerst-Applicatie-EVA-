import { describe, expect, it } from 'vitest'
import { bewakingPerCode, type BewakingRegelPerCode } from './bewaking-per-code'

const regel = (over: Partial<BewakingRegelPerCode>): BewakingRegelPerCode => ({
  code: '.A', naam: 'Algemeen', begroot: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0,
  arbeidPrognose: 0, arbeidskosten: 0, geboekteKosten: 0, progress: null,
  ...over,
})

describe('bewakingPerCode', () => {
  it('telt dezelfde code in twee hoofdstukken op in plaats van de laatste te laten winnen', () => {
    const r = bewakingPerCode([
      regel({ begroot: 1000, prognose: 800, prognoseUren: 10, geboekteUren: 4, arbeidPrognose: 500, arbeidskosten: 200, geboekteKosten: 300 }),
      regel({ begroot: 500, prognose: 200, prognoseUren: 5, geboekteUren: 1, arbeidPrognose: 100, arbeidskosten: 50, geboekteKosten: 75 }),
    ]).get('.A')!
    expect(r).toMatchObject({ begroot: 1500, prognose: 1000, prognoseUren: 15, geboekteUren: 5, arbeidPrognose: 600, arbeidskosten: 250, geboekteKosten: 375 })
  })

  it('weegt het % gereed naar prognose, en valt zonder prognose terug op het gemiddelde', () => {
    expect(bewakingPerCode([regel({ prognose: 800, progress: 50 }), regel({ prognose: 200, progress: 100 })]).get('.A')!.progress).toBe(60)
    expect(bewakingPerCode([regel({ progress: 40 }), regel({ progress: 80 })]).get('.A')!.progress).toBe(60)
    expect(bewakingPerCode([regel({ prognose: 100 })]).get('.A')!.progress).toBeNull()
  })

  it('laat één regel per code ongewijzigd en slaat regels zonder code of buiten het filter over', () => {
    const r = bewakingPerCode(
      [regel({ code: 'X', prognose: 300, progress: 33.33 }), regel({ code: null, prognose: 9 }), regel({ code: 'CO01', prognose: 5 })],
      (x) => x.code !== 'CO01',
    )
    expect([...r.keys()]).toEqual(['X'])
    expect(r.get('X')).toMatchObject({ prognose: 300, progress: 33.33 })
  })
})
