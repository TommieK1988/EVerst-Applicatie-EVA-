import { describe, it, expect } from 'vitest'
import { bedragklasse, bedragklasseLabels, eurDrempel, leesGrenzen, STANDAARD_GRENZEN } from './bedragklassen'

describe('bedragklasse', () => {
  it('volgt de afgesproken grenzen (3k, 45k, 125k)', () => {
    expect(bedragklasse(2_999)).toBe('klein')
    expect(bedragklasse(3_000)).toBe('middel')
    expect(bedragklasse(44_999)).toBe('middel')
    expect(bedragklasse(45_000)).toBe('groot')
    expect(bedragklasse(124_999)).toBe('groot')
    expect(bedragklasse(125_000)).toBe('mega')
  })

  it('zonder bedrag is middel', () => {
    expect(bedragklasse(null)).toBe('middel')
  })
})

describe('instelbare grenzen', () => {
  const g = { kleinTot: 5_000, grootVanaf: 60_000, megaVanaf: 200_000 }
  it('rekent met de meegegeven grenzen', () => {
    expect(bedragklasse(4_000, g)).toBe('klein')
    expect(bedragklasse(150_000, g)).toBe('groot')
    expect(bedragklasse(200_000, g)).toBe('mega')
  })
  it('leest de instelling, en valt bij onzin terug op de standaard', () => {
    expect(leesGrenzen(g)).toEqual(g)
    expect(leesGrenzen(null)).toEqual(STANDAARD_GRENZEN)
    expect(leesGrenzen({ kleinTot: 50_000, grootVanaf: 45_000, megaVanaf: 125_000 })).toEqual(STANDAARD_GRENZEN)
    expect(leesGrenzen({ kleinTot: 'x' })).toEqual(STANDAARD_GRENZEN)
  })
  it('labels volgen de grenzen', () => {
    expect(bedragklasseLabels(g).map(l => l.uitleg)).toEqual([
      'vanaf € 200k', '€ 60k – € 200k', '€ 5k – € 60k', 'tot € 5k, niet nabellen',
    ])
    expect(eurDrempel(2_500)).toBe('€ 2.500')
  })
})
