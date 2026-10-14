import { describe, it, expect } from 'vitest'
import { rekenMaat, normaliseerEenheid, ontbrekendeMaat } from './maat-rekenen'

/**
 * De ene rekenregel van maat naar hoeveelheid, voor de meetstaat én de
 * mini-meetstaat in de calculatie.
 */

describe('rekenMaat', () => {
  it('m¹: breedtes plus hoogtes, maal aantal', () => {
    // Kozijn 2,40 × 1,60, rondom gemeten, 12 stuks
    expect(rekenMaat({ eenheid: 'm¹', breedte: 2.4, breedte_aantal: 2, hoogte: 1.6, hoogte_aantal: 2, aantal: 12 }))
      .toBe(96)
  })

  it('m¹: een lengte alleen is één breedte', () => {
    expect(rekenMaat({ eenheid: 'm¹', breedte: 42.5 })).toBe(42.5)
    expect(rekenMaat({ eenheid: 'm¹', breedte: 3, factor: 4 })).toBe(12)
  })

  it('m²: breedte × hoogte × factor × aantal; per-maat-aantallen tellen niet', () => {
    expect(rekenMaat({ eenheid: 'm²', breedte: 0.93, hoogte: 2.15, factor: 2, aantal: 12 })).toBe(47.988)
    expect(rekenMaat({ eenheid: 'm²', breedte: 1, hoogte: 1, breedte_aantal: 2, hoogte_aantal: 2 })).toBe(1)
  })

  it('m² met maar één maat is onvolledig en telt 0, niet stil 1', () => {
    expect(rekenMaat({ eenheid: 'm²', breedte: 12.6 })).toBe(0)
    expect(rekenMaat({ eenheid: 'm²', hoogte: 3, aantal: 4 })).toBe(0)
  })

  it('m² zonder maten: een rechtstreeks opgegeven oppervlak (factor × aantal)', () => {
    expect(rekenMaat({ eenheid: 'm²', aantal: 40 })).toBe(40)
  })

  it('m³: drie maten, of 0 als er één ontbreekt', () => {
    expect(rekenMaat({ eenheid: 'm³', breedte: 2, hoogte: 3, diepte: 0.5, factor: 2 })).toBe(6)
    expect(rekenMaat({ eenheid: 'm³', breedte: 2, hoogte: 3 })).toBe(0)
  })

  it('stuks en andere eenheden: alleen factor × aantal, maten tellen niet', () => {
    expect(rekenMaat({ eenheid: 'st', aantal: 12 })).toBe(12)
    expect(rekenMaat({ eenheid: 'st', breedte: 2, hoogte: 3, aantal: 5 })).toBe(5)
  })

  it('lege of nul-factor en -aantal tellen als 1', () => {
    expect(rekenMaat({ eenheid: 'm²', breedte: 2, hoogte: 3, factor: 0, aantal: 0 })).toBe(6)
  })

  it("'m2' uit de bibliotheek rekent als m²", () => {
    expect(rekenMaat({ eenheid: 'm2', breedte: 2, hoogte: 3 })).toBe(6)
    expect(rekenMaat({ eenheid: 'm2', breedte: 2 })).toBe(0)
  })
})

describe('normaliseerEenheid', () => {
  it('schrijft m2/m1/m3 als m²/m¹/m³ en laat de rest staan', () => {
    expect(normaliseerEenheid('m2')).toBe('m²')
    expect(normaliseerEenheid(' M1 ')).toBe('m¹')
    expect(normaliseerEenheid('m3')).toBe('m³')
    expect(normaliseerEenheid('st')).toBe('st')
    expect(normaliseerEenheid(undefined)).toBe('')
  })
})

describe('ontbrekendeMaat', () => {
  it('noemt de ontbrekende maat van een half ingevuld vlak', () => {
    expect(ontbrekendeMaat({ eenheid: 'm²', breedte: 12.6 })).toBe('hoogte')
    expect(ontbrekendeMaat({ eenheid: 'm³', hoogte: 2 })).toBe('breedte en diepte')
  })

  it('zwijgt bij een compleet, een leeg of een niet-vlak', () => {
    expect(ontbrekendeMaat({ eenheid: 'm²', breedte: 1, hoogte: 2 })).toBeNull()
    expect(ontbrekendeMaat({ eenheid: 'm²', aantal: 40 })).toBeNull()
    expect(ontbrekendeMaat({ eenheid: 'm¹', breedte: 3 })).toBeNull()
  })
})
