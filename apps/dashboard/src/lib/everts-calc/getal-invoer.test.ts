import { describe, it, expect } from 'vitest'
import { leesGetal, toonGetal, isGetalInTyping } from './getal-invoer'

describe('leesGetal', () => {
  it('neemt een komma én een punt aan', () => {
    expect(leesGetal('2,40')).toBe(2.4)
    expect(leesGetal('2.40')).toBe(2.4)
    expect(leesGetal(' 12 ')).toBe(12)
    expect(leesGetal(',5')).toBe(0.5)
    expect(leesGetal('3,')).toBe(3)
  })

  it('leeg of geen getal: undefined', () => {
    expect(leesGetal('')).toBeUndefined()
    expect(leesGetal(',')).toBeUndefined()
    expect(leesGetal('2,4,5')).toBeUndefined()
    expect(leesGetal('abc')).toBeUndefined()
    expect(leesGetal('-2')).toBeUndefined()
  })
})

describe('toonGetal', () => {
  it('toont met een komma, zonder overbodige nullen', () => {
    expect(toonGetal(2.4)).toBe('2,4')
    expect(toonGetal(0.93)).toBe('0,93')
    expect(toonGetal(12)).toBe('12')
    expect(toonGetal(0.1 + 0.2)).toBe('0,3')
  })

  it('leeg en 0 tonen niets', () => {
    expect(toonGetal(undefined)).toBe('')
    expect(toonGetal(0)).toBe('')
  })
})

describe('isGetalInTyping', () => {
  it('laat halve getallen toe terwijl je typt, maar geen letters of twee kommas', () => {
    expect(isGetalInTyping('2,')).toBe(true)
    expect(isGetalInTyping('')).toBe(true)
    expect(isGetalInTyping('0.9')).toBe(true)
    expect(isGetalInTyping('2,4,')).toBe(false)
    expect(isGetalInTyping('2a')).toBe(false)
  })
})
