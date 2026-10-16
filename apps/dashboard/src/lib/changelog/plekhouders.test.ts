import { describe, it, expect } from 'vitest'
import { heeftPlekhouder, vulPlekhouders } from './plekhouders'

describe('vulPlekhouders', () => {
  const grenzen = { kleinTot: 5_000, grootVanaf: 60_000, megaVanaf: 200_000 }
  it('vult de actuele bedragklassegrenzen in', () => {
    expect(vulPlekhouders('Onder {offerte_klein_tot}, vanaf {offerte_mega_vanaf}.', { grenzen }))
      .toBe('Onder € 5.000, vanaf € 200.000.')
  })
  it('laat onbekende plekhouders en gewone tekst staan', () => {
    expect(vulPlekhouders('Zie {onbekend} en € 3.000', { grenzen })).toBe('Zie {onbekend} en € 3.000')
    expect(heeftPlekhouder('geen plekhouder')).toBe(false)
    expect(heeftPlekhouder('wel {offerte_klein_tot}')).toBe(true)
  })
})
