import { describe, expect, it } from 'vitest'

import { waarGaatHetOver } from './koppeling-tekst'
import { SAMENVATTING_ONLEESBAAR } from './types'

describe('waarGaatHetOver', () => {
  it('neemt de samenvatting van de AI', () => {
    expect(waarGaatHetOver('Klant meldt lekkage bij de dakgoot.', 'Beste, ...'))
      .toBe('Klant meldt lekkage bij de dakgoot.')
  })

  it('valt terug op het begin van de mail als er geen samenvatting is', () => {
    expect(waarGaatHetOver(null, '  Beste Jan,\n\nde dakgoot   lekt weer. '))
      .toBe('Beste Jan, de dakgoot lekt weer.')
  })

  it('geeft de foutmelding van een onleesbare mail niet door als inhoud', () => {
    expect(waarGaatHetOver(SAMENVATTING_ONLEESBAAR, 'Zie bijlage.')).toBe('Zie bijlage.')
  })

  it('levert niets als er niets is', () => {
    expect(waarGaatHetOver('  ', null)).toBeNull()
  })

  it('kapt lange tekst af', () => {
    const uit = waarGaatHetOver('a'.repeat(500), null)
    expect(uit).toHaveLength(300)
    expect(uit?.endsWith('…')).toBe(true)
  })
})
