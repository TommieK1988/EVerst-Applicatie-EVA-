import { describe, expect, it } from 'vitest'
import { isMijnBeurt } from './types'

const basis = { huidige_goedkeurder_id: 'tom', bouw7_status: 1, goedkeuring_bron: 'bouw7' as const, eva_besluit: null }

describe('isMijnBeurt', () => {
  it('ter goedkeuring en ik ben de goedkeurder', () => {
    expect(isMijnBeurt(basis, 'tom')).toBe(true)
    expect(isMijnBeurt(basis, 'bas')).toBe(false)
  })
  it('al goedgekeurd, betaald of afgekeurd in Bouw7: niet meer aan zet, ook al staat de naam er nog', () => {
    for (const s of [2, 4, 5]) expect(isMijnBeurt({ ...basis, bouw7_status: s }, 'tom')).toBe(false)
  })
  it('EVA-factuur op concept (nog niet omgezet) telt wel; Bouw7-concept niet', () => {
    expect(isMijnBeurt({ ...basis, goedkeuring_bron: 'eva', bouw7_status: 0 }, 'tom')).toBe(true)
    expect(isMijnBeurt({ ...basis, bouw7_status: 0 }, 'tom')).toBe(false)
  })
  it('al besloten in EVA: niet meer aan zet', () => {
    expect(isMijnBeurt({ ...basis, goedkeuring_bron: 'eva', eva_besluit: 'goedgekeurd' }, 'tom')).toBe(false)
  })
})
