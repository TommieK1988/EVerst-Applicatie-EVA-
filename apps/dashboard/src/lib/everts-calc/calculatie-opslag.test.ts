import { describe, it, expect } from 'vitest'
import { eigenOpslagen, geldigeStandaardOpslag, STANDAARD_OPSLAG_PCT } from './calculatie-opslag'

describe('calculatie-opslag', () => {
  it('valt terug op 25% zonder geldige instelling', () => {
    expect(geldigeStandaardOpslag(undefined)).toBe(STANDAARD_OPSLAG_PCT)
    expect(geldigeStandaardOpslag(-5)).toBe(STANDAARD_OPSLAG_PCT)
    expect(geldigeStandaardOpslag(Number.NaN)).toBe(STANDAARD_OPSLAG_PCT)
    expect(geldigeStandaardOpslag(0)).toBe(0)
    expect(geldigeStandaardOpslag(30)).toBe(30)
  })

  it('telt regels met een eigen opslag op de regel of een norm één keer', () => {
    const r = eigenOpslagen(
      [{ id: 'a', opslag_pct: 30 }, { id: 'b' }, { id: 'c', opslag_pct: 29.9995 }],
      [{ calculatieregel_id: 'a', opslag_pct: 10 }, { calculatieregel_id: 'b', opslag_pct: 10 }, { calculatieregel_id: 'c' }],
    )
    expect(r.aantal).toBe(3)
    expect(r.percentages).toEqual([10, 30])
  })

  it('niets eigen: leeg', () => {
    expect(eigenOpslagen([{ id: 'a' }], [{ calculatieregel_id: 'a' }])).toEqual({ aantal: 0, percentages: [] })
  })
})
