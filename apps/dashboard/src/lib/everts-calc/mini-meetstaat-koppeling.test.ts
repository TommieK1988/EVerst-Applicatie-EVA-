import { describe, it, expect } from 'vitest'
import {
  metingNaam, metingKeuzes, synchroniseerKoppeling, gedeeldMet, handmatigeHoeveelheid,
  type RegelMetMeting,
} from './mini-meetstaat-koppeling'
import type { MiniMaatrij, MiniMeting } from './types'

const rij = (o: Partial<MiniMaatrij>): MiniMaatrij =>
  ({ id: o.id ?? 'r', omschrijving: '', dim1: 0, dim2: 0, dim3: 0, factor: 1, ...o })

// Gevelvlak 24 × 17,2 = 412,80; ramen en deuren samen 92,40; netto 320,40.
const gevel = [
  rij({ id: 'g', omschrijving: 'Gevelvlak voorgevel', dim1: 24, dim2: 17.2 }),
  rij({ id: 'r', omschrijving: 'Ramen', dim1: 1.2, dim2: 1.5, factor: 36, aftrek: true }),
  rij({ id: 'd', omschrijving: 'Voordeuren', dim1: 1, dim2: 2.3, factor: 12, aftrek: true }),
]

const meting = (o: Partial<MiniMeting> = {}): MiniMeting =>
  ({ eenheid: 'm²', rijen: gevel, gemeten_op: '2026-10-15T10:00:00.000Z', ...o })

const regel = (id: string, omschrijving: string, m?: MiniMeting, eenheid = 'm²'): RegelMetMeting =>
  ({ id, omschrijving, eenheid: eenheid as RegelMetMeting['eenheid'], mini_meetstaat: m })

describe('metingNaam', () => {
  it('neemt de eerste gewone rij met een omschrijving', () => {
    expect(metingNaam(gevel, 'Gevel reinigen')).toBe('Gevelvlak voorgevel')
  })

  it('slaat aftrekregels over en valt terug op de regelomschrijving', () => {
    expect(metingNaam([rij({ omschrijving: 'Ramen', aftrek: true }), rij({ dim1: 3 })], 'Gevel reinigen'))
      .toBe('Gevel reinigen')
  })
})

describe('metingKeuzes', () => {
  const regels = [
    regel('a', 'Gevel reinigen', meting({ koppel_id: 'k1', gebruik: 'netto' })),
    regel('b', 'Voegwerk herstellen', meting({ koppel_id: 'k1', gebruik: 'netto' })),
    regel('c', 'Dakgoot vervangen', { eenheid: 'm¹', rijen: [rij({ omschrijving: 'Goot', dim1: 12 })], gemeten_op: 'x' }),
    regel('d', 'Kozijnen schilderen', meting({ rijen: [rij({ omschrijving: 'Kozijnen', dim1: 2, dim2: 3 })] })),
    regel('e', 'Leeg', { eenheid: 'm²', rijen: [rij({})], gemeten_op: 'x' }),
    regel('f', 'Steiger plaatsen'),
  ]

  it('toont alleen metingen in dezelfde eenheid, één keer per koppeling', () => {
    const k = metingKeuzes(regels, 'f', 'm2')
    expect(k.map(x => x.sleutel)).toEqual(['k1', 'd'])
    expect(k[0]).toMatchObject({
      koppelId: 'k1', bronRegelId: 'a', naam: 'Gevelvlak voorgevel', bruto: 412.8, netto: 320.4, heeftAftrek: true,
      regels: ['Gevel reinigen', 'Voegwerk herstellen'],
    })
    expect(k[1]).toMatchObject({ koppelId: undefined, bronRegelId: 'd', naam: 'Kozijnen', bruto: 6 })
  })

  it('laat de eigen regel en de eigen koppeling weg', () => {
    expect(metingKeuzes(regels, 'a', 'm²', 'k1').map(x => x.sleutel)).toEqual(['d'])
  })

  it('een opgeslagen naam gaat voor', () => {
    const k = metingKeuzes([regel('a', 'x', meting({ naam: 'Voorgevel' }))], 'z', 'm²')
    expect(k[0].naam).toBe('Voorgevel')
  })

  it('zonder naam en zonder omschrijving bij de maten: zegt waar hij vandaan komt', () => {
    const k = metingKeuzes([regel('a', 'Voegwerk vervangen', meting({ rijen: [rij({ dim1: 4, dim2: 2 })] }))], 'z', 'm²')
    expect(k[0].naam).toBe('Meting uit Voegwerk vervangen')
  })
})

describe('synchroniseerKoppeling', () => {
  // Bijgewerkte gevel: 25 breed in plaats van 24 → bruto 430, netto 337,60.
  const nieuw = meting({
    koppel_id: 'k1', naam: 'Gevelvlak voorgevel', gemeten_op: 'nu', gebruik: 'netto',
    rijen: [{ ...gevel[0], dim1: 25 }, gevel[1], gevel[2]],
  })
  const regels = [
    regel('a', 'Gevel reinigen', meting({ koppel_id: 'k1', gebruik: 'netto' })),
    regel('b', 'Voegwerk herstellen', meting({ koppel_id: 'k1', gebruik: 'netto' })),
    regel('c', 'Steiger plaatsen', meting({ koppel_id: 'k1', gebruik: 'bruto' })),
    regel('d', 'Los', meting({ gebruik: 'bruto' })),
  ]

  it('werkt alle andere regels met dezelfde koppeling bij, elk met zijn eigen bruto of netto', () => {
    const uit = synchroniseerKoppeling(regels, 'a', nieuw)
    expect(uit.map(u => u.id)).toEqual(['b', 'c'])
    expect(uit[0].patch.hoeveelheid).toBe(337.6)
    expect(uit[1].patch.hoeveelheid).toBe(430)
    expect(uit[1].patch.mini_meetstaat).toMatchObject({
      koppel_id: 'k1', gebruik: 'bruto', gemeten_op: 'nu', naam: 'Gevelvlak voorgevel', rijen: nieuw.rijen,
    })
  })

  it('zonder koppel_id gebeurt er niets', () => {
    expect(synchroniseerKoppeling(regels, 'a', { ...nieuw, koppel_id: undefined })).toEqual([])
  })

  it('de bron uit de keuzelijst krijgt de nieuwe koppel_id en houdt zijn eigen gebruik', () => {
    const uit = synchroniseerKoppeling(regels, 'x', { ...nieuw, koppel_id: 'k2' }, 'd')
    expect(uit).toHaveLength(1)
    expect(uit[0]).toMatchObject({ id: 'd', patch: { hoeveelheid: 430, mini_meetstaat: { koppel_id: 'k2', gebruik: 'bruto' } } })
  })

  it('een regel in een andere eenheid laat de koppeling los in plaats van fout te rekenen', () => {
    const uit = synchroniseerKoppeling(
      [...regels.slice(0, 1), regel('m', 'Omgezet', meting({ koppel_id: 'k1' }), 'm¹')], 'a', nieuw,
    )
    expect(uit).toEqual([{ id: 'm', patch: { mini_meetstaat: { ...meting({ koppel_id: 'k1' }), koppel_id: undefined } } }])
  })
})

describe('gedeeldMet en met de hand typen', () => {
  const regels = [
    regel('a', 'Gevel reinigen', meting({ koppel_id: 'k1' })),
    regel('b', 'Voegwerk herstellen', meting({ koppel_id: 'k1' })),
    regel('c', 'Los', meting()),
  ]

  it('geeft de andere regels met dezelfde koppeling', () => {
    expect(gedeeldMet(regels, 'a', 'k1').map(r => r.id)).toEqual(['b'])
    expect(gedeeldMet(regels, 'c', undefined)).toEqual([])
  })

  it('een getypte hoeveelheid laat de koppeling los maar houdt de meting', () => {
    const p = handmatigeHoeveelheid(regels[0], 300)
    expect(p.hoeveelheid).toBe(300)
    expect(p.mini_meetstaat?.koppel_id).toBeUndefined()
    expect(p.mini_meetstaat?.rijen).toBe(gevel)
    expect(handmatigeHoeveelheid(regels[2], 300)).toEqual({ hoeveelheid: 300 })
  })
})
