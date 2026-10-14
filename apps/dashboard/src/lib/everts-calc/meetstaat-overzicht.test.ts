import { describe, it, expect } from 'vitest'
import { rekenregelTekst, totalenPerEenheid, totalenTekst } from './meetstaat-overzicht'
import { rekenMaat } from './maat-rekenen'
import type { Meetregel } from './types'

const regel = (x: Partial<Meetregel>): Meetregel => ({
  id: 'r', meetstaat_id: 'ms', groep_id: 'g', volgorde: 1, aantal: 1, eenheid: 'm²',
  is_leeg: false, aangepast_op: '', ...x,
})

describe('rekenregelTekst', () => {
  it('m¹ rondom gemeten: breedtes plus hoogtes, maal aantal', () => {
    expect(rekenregelTekst(regel({ eenheid: 'm¹', breedte: 2.4, breedte_aantal: 2, hoogte: 1.6, hoogte_aantal: 2, aantal: 12 })))
      .toBe('(2,40×2 + 1,60×2) × 12')
  })

  it('m²: breedte × hoogte, dan x en Aantal; enen vallen weg', () => {
    expect(rekenregelTekst(regel({ breedte: 0.93, hoogte: 2.15, factor: 2, aantal: 12 }))).toBe('0,93 × 2,15 × 2 × 12')
    expect(rekenregelTekst(regel({ breedte: 1.1, hoogte: 1.2 }))).toBe('1,10 × 1,20')
  })

  it('niets te tonen bij één losse maat of een onvolledige regel', () => {
    expect(rekenregelTekst(regel({ eenheid: 'm¹', breedte: 42.5 }))).toBe('')
    expect(rekenregelTekst(regel({ breedte: 12.6 }))).toBe('')
    expect(rekenregelTekst(regel({ eenheid: 'st', aantal: 12 }))).toBe('')
  })

  it('m¹ met één lengte en een aantal', () => {
    expect(rekenregelTekst(regel({ eenheid: 'm¹', breedte: 3, aantal: 4 }))).toBe('3,00 × 4')
  })

  it('stuks: x × Aantal', () => {
    expect(rekenregelTekst(regel({ eenheid: 'st', factor: 2, aantal: 6 }))).toBe('2 × 6')
  })

  it('een handmatige hoeveelheid zegt dat ook', () => {
    expect(rekenregelTekst(regel({ breedte: 1, hoogte: 1, hoeveelheid_override: 5 }))).toBe('handmatig')
  })
})

describe('totalenPerEenheid', () => {
  it('telt per eenheid, m² vóór m¹, en m2 als m²', () => {
    const regels = [
      regel({ eenheid: 'm¹', breedte: 2, aantal: 3 }),
      regel({ breedte: 2, hoogte: 3 }),
      regel({ eenheid: 'm2', breedte: 1, hoogte: 1 }),
      regel({ breedte: 5 }),          // onvolledig: telt niet
    ]
    const totalen = totalenPerEenheid(regels, rekenMaat)
    expect(totalen).toEqual([{ eenheid: 'm²', totaal: 7 }, { eenheid: 'm¹', totaal: 6 }])
    expect(totalenTekst(totalen)).toBe('7,00 m² · 6,00 m¹')
  })
})
