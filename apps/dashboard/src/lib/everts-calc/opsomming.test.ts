import { describe, it, expect } from 'vitest'
import { metOpsommingstekens } from './opsomming'

describe('metOpsommingstekens', () => {
  it('zet streepjes en sterretjes aan het begin van een regel om', () => {
    expect(metOpsommingstekens('Inclusief:\n- muren\n* plafonds')).toBe('Inclusief:\n• muren\n• plafonds')
  })
  it('behoudt inspringing', () => {
    expect(metOpsommingstekens('  - sub')).toBe('  • sub')
  })
  it('laat streepjes midden in een zin en zonder spatie staan', () => {
    expect(metOpsommingstekens('2-laags dekkend\n-10% korting')).toBe('2-laags dekkend\n-10% korting')
  })
  it('laat lege tekst leeg', () => {
    expect(metOpsommingstekens('')).toBe('')
  })
})
