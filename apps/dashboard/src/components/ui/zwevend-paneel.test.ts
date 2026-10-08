import { describe, expect, it } from 'vitest'
import { plaatsZwevendPaneel } from './zwevend-paneel'

const scherm = { schermHoogte: 800 }

describe('plaatsZwevendPaneel', () => {
  it('opent naar beneden als het eronder past', () => {
    expect(plaatsZwevendPaneel({ top: 100, bottom: 120 }, { hoogte: 260, ...scherm }))
      .toEqual({ top: 122, maxHeight: 260 })
  })

  it('opent naar boven bij een rij onderaan het scherm', () => {
    // Onder: 800 - 760 - 2 - 8 = 30. Boven: 740 - 2 - 8 = 730.
    expect(plaatsZwevendPaneel({ top: 740, bottom: 760 }, { hoogte: 260, ...scherm }))
      .toEqual({ bottom: 62, maxHeight: 260 })
  })

  it('kiest de ruimste kant en krimpt als het nergens helemaal past', () => {
    // Onder: 800 - 320 - 2 - 8 = 470. Boven: 300 - 2 - 8 = 290. Gewenst: 600.
    expect(plaatsZwevendPaneel({ top: 300, bottom: 320 }, { hoogte: 600, ...scherm }))
      .toEqual({ top: 322, maxHeight: 470 })
  })

  it('krimpt naar boven tot de ruimte boven de knop', () => {
    // Onder: 800 - 620 - 2 - 8 = 170. Boven: 600 - 2 - 8 = 590. Gewenst: 700.
    expect(plaatsZwevendPaneel({ top: 600, bottom: 620 }, { hoogte: 700, ...scherm }))
      .toEqual({ bottom: 202, maxHeight: 590 })
  })

  it('geeft nooit een negatieve hoogte', () => {
    expect(plaatsZwevendPaneel({ top: 0, bottom: 800 }, { hoogte: 200, ...scherm }).maxHeight).toBe(0)
  })
})
