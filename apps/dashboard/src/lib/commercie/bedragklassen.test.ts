import { describe, it, expect } from 'vitest'
import { bedragklasse } from './bedragklassen'

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
