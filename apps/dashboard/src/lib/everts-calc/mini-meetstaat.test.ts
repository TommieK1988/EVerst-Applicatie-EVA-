import { describe, it, expect } from 'vitest'
import { startToestand, maakMeting, totaalMeting, rijHeeftData } from './mini-meetstaat'
import type { MiniMaatrij, MiniMeting } from './types'

const rij = (o: Partial<MiniMaatrij>): MiniMaatrij =>
  ({ id: o.id ?? 'r', omschrijving: '', dim1: 0, dim2: 0, dim3: 0, factor: 1, ...o })

const meting = (rijen: MiniMaatrij[], eenheid = 'm²'): MiniMeting =>
  ({ eenheid, rijen, gemeten_op: '2026-10-15T10:00:00.000Z' })

const dakvlakken = [
  rij({ id: 'a', omschrijving: 'Dakvlak noord', dim1: 14.2, dim2: 10 }),
  rij({ id: 'b', omschrijving: 'Dakvlak zuid', dim1: 14.2, dim2: 10 }),
]

describe('startToestand', () => {
  it('opent met de bewaarde meting en een lege rij erachter', () => {
    const s = startToestand(meting(dakvlakken), 284, 'm²')
    expect(s.rijen.map(r => r.omschrijving)).toEqual(['Dakvlak noord', 'Dakvlak zuid', ''])
    expect(s.afwijking).toBeNull()
  })

  it('meldt een afwijking als de hoeveelheid met de hand is aangepast', () => {
    const s = startToestand(meting(dakvlakken), 300, 'm²')
    expect(s.afwijking).toEqual({ meting: 284, calculatie: 300 })
  })

  it('afronding op twee decimalen telt niet als afwijking', () => {
    const r = [rij({ omschrijving: 'x', dim1: 1.333, dim2: 1 })]
    expect(startToestand(meting(r), 1.33, 'm²').afwijking).toBeNull()
  })

  it('negeert een meting in een andere eenheid en valt terug op de bestaande hoeveelheid', () => {
    const s = startToestand(meting(dakvlakken, 'm¹'), 284, 'm²')
    expect(s.rijen[0]).toMatchObject({ omschrijving: 'Bestaande hoeveelheid', dim1: 284, dim2: 1 })
    expect(s.afwijking).toBeNull()
  })

  it('m2 uit de bibliotheek is dezelfde eenheid als m²', () => {
    const s = startToestand(meting(dakvlakken, 'm2'), 284, 'm²')
    expect(s.rijen).toHaveLength(3)
  })

  it('zonder meting en zonder hoeveelheid: één lege rij', () => {
    const s = startToestand(undefined, 0, 'm²')
    expect(s.rijen).toHaveLength(1)
    expect(rijHeeftData(s.rijen[0])).toBe(false)
  })
})

describe('maakMeting', () => {
  it('bewaart alleen rijen met inhoud', () => {
    const m = maakMeting([...dakvlakken, rij({ id: 'leeg' })], 'm²', 'nu')
    expect(m).toEqual({ eenheid: 'm²', rijen: dakvlakken, gemeten_op: 'nu' })
    expect(totaalMeting(m.rijen, 'm²')).toBe(284)
  })
})
