import { describe, it, expect } from 'vitest'
import { termijnBedragen, type TermijnRij } from './termijnen-schema'

/**
 * Tests op de verdeling van een bedrag over een termijnschema.
 *
 * WAAROM: sinds meerwerk het betalingsschema van zijn eigen offerte volgt, loopt deze functie
 * over élk akkoord op aangenomen meerwerk. Wat er hier uitkomt gaat als termijn naar Bouw7 en
 * daarna als factuur naar de klant. Een cent die wegvalt in de afronding komt dus op geen enkele
 * factuur terecht, en dat merk je pas bij de laatste termijn van een project.
 *
 * De harde eis is daarom niet zozeer wat elke termijn wordt, maar dat de som exact de grondslag
 * blijft. De laatste termijn absorbeert het verschil.
 */

const rijen = (...pcts: number[]): TermijnRij[] =>
  pcts.map((percentage, i) => ({ omschrijving: `T${i + 1}`, percentage, btwTariefBouw7Id: 1 }))

describe('termijnBedragen', () => {
  it('verdeelt 30/30/30/10 en houdt de som exact gelijk', () => {
    const bedragen = termijnBedragen(rijen(30, 30, 30, 10), 19225.35)
    expect(bedragen).toEqual([5767.61, 5767.61, 5767.61, 1922.52])
    expect(bedragen.reduce((s, b) => s + b, 0)).toBeCloseTo(19225.35, 2)
  })

  it('laat één termijn van 100% het hele bedrag houden', () => {
    expect(termijnBedragen(rijen(100), 4973.4)).toEqual([4973.4])
  })

  it('legt het afrondingsverschil bij de laatste termijn', () => {
    // 3 x 33,333% van € 100 kan niet zonder rest; de laatste vangt het op.
    const bedragen = termijnBedragen(rijen(33.333, 33.333, 33.334), 100)
    expect(bedragen.reduce((s, b) => s + b, 0)).toBeCloseTo(100, 2)
    expect(bedragen[2]).not.toEqual(bedragen[0])
  })

  it('verdeelt een negatief bedrag (minderwerk) zonder een cent te verliezen', () => {
    const bedragen = termijnBedragen(rijen(50, 25, 15, 10), -4053.95)
    expect(bedragen.reduce((s, b) => s + b, 0)).toBeCloseTo(-4053.95, 2)
  })
})
