import { describe, it, expect } from 'vitest'
import { deelInBakken, standaardSelectie } from './opschonen'
import type { TeDoenRij } from './te-doen'

const r = (id: string, dagen: number | null, bedrag: number) => ({ id, _openDagen: dagen, _bedrag: bedrag }) as TeDoenRij

describe('opschoonronde', () => {
  const rijen = [r('jong', 30, 5_000), r('oud', 400, 10_000), r('oud-groot', 500, 80_000), r('oud-contact', 400, 8_000), r('half', 200, 20_000), r('geen-datum', null, 1_000)]
  const { a, b } = deelInBakken(rijen, id => id === 'oud-contact')
  it('jong en zonder datum vallen erbuiten; ouder dan een jaar zonder contact is bak A', () => {
    expect(a.map(x => x.id)).toEqual(['oud-groot', 'oud'])
    expect(b.map(x => x.id)).toEqual(['oud-contact', 'half'])
  })
  it('vinkt in bak A alleen aan wat onder de 30k blijft', () => {
    expect([...standaardSelectie(a)]).toEqual(['oud'])
  })
})
