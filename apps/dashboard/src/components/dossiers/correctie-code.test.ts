import { describe, expect, it } from 'vitest'
import { isCorrectieCode } from './types'

describe('isCorrectieCode', () => {
  it('herkent de kale code, ongeacht hoofdletters en spaties', () => {
    expect(isCorrectieCode('CO01')).toBe(true)
    expect(isCorrectieCode('co01')).toBe(true)
    expect(isCorrectieCode('  CO01 ')).toBe(true)
  })

  it('herkent de kostengroep-string met naam, ook met een gewoon streepje', () => {
    expect(isCorrectieCode('CO01 — Correcties')).toBe(true)
    expect(isCorrectieCode('CO01 - Correcties')).toBe(true)
  })

  it('laat andere codes met hetzelfde begin met rust', () => {
    expect(isCorrectieCode('CO010')).toBe(false)
    expect(isCorrectieCode('CO02')).toBe(false)
    expect(isCorrectieCode('SP01 — CO01')).toBe(false)
  })

  it('is onwaar voor een lege waarde', () => {
    expect(isCorrectieCode(null)).toBe(false)
    expect(isCorrectieCode(undefined)).toBe(false)
    expect(isCorrectieCode('')).toBe(false)
  })
})
