import { describe, expect, it } from 'vitest'
import { volgendRechterPaneel } from './rechter-paneel'

describe('volgendRechterPaneel', () => {
  it('openen van het ene paneel sluit het andere', () => {
    expect(volgendRechterPaneel('controle', 'uitvraag', true)).toBe('uitvraag')
    expect(volgendRechterPaneel('uitvraag', 'controle', true)).toBe('controle')
  })
  it('sluiten raakt alleen het paneel zelf', () => {
    expect(volgendRechterPaneel('controle', 'controle', false)).toBeNull()
    expect(volgendRechterPaneel('uitvraag', 'controle', false)).toBe('uitvraag')
  })
  it('vanuit niets open', () => {
    expect(volgendRechterPaneel(null, 'controle', true)).toBe('controle')
    expect(volgendRechterPaneel(null, 'uitvraag', false)).toBeNull()
  })
})
