import { describe, it, expect } from 'vitest'
import { afrondSuggestie, bouwUrenRijen, dagenTekst, totaalVan } from './uren-per-groep'
import type { Calculatieregel, Componentregel, Groep } from './types'

const groep = (id: string, parent_id: string | null = null): Groep =>
  ({ id, scenario_id: 's', parent_id, naam: id, niveau: parent_id ? 2 : 1, volgorde: 0 })
const regel = (id: string, groep_id: string, hoeveelheid: number): Calculatieregel =>
  ({ id, groep_id, omschrijving: id, hoeveelheid, eenheid: 'm1', volgorde: 0 })
const arbeid = (rid: string, norm: number): Componentregel =>
  ({ id: `c-${rid}`, calculatieregel_id: rid, type: 'arbeid', norm_hoeveelheid: norm, tarief: 58 })

describe('afronden op dagen en weken', () => {
  it('tot ruim drie dagen naar boven op een hele dag', () => {
    expect(afrondSuggestie(20.7, 20.7)).toBe(22.5)
  })
  it('daarboven naar de dichtstbijzijnde week, ook naar beneden', () => {
    expect(afrondSuggestie(32.56, 32.56)).toBe(37.5)
    expect(afrondSuggestie(39.1, 39.1)).toBe(37.5)
    expect(afrondSuggestie(71.66, 71.66)).toBe(75)
  })
  it('dagen en weken als tekst, zonder afrondingsruis', () => {
    expect(dagenTekst(37.5000001)).toBe('5 = 1 week')
    expect(dagenTekst(75)).toBe('10 = 2 weken')
    expect(dagenTekst(20.7)).toBe('2,8')
  })
  it('niets als het al rond is of buiten −25…+50% valt', () => {
    expect(afrondSuggestie(30, 37.5)).toBeNull()
    expect(afrondSuggestie(2, 2)).toBeNull()   // 7,5 u is +275%
  })
})

describe('uren per groep', () => {
  const groepen = [groep('h'), groep('k', 'h'), groep('d', 'h'), groep('oa')]
  const regels = [regel('r1', 'k', 120), regel('r2', 'd', 10)]
  const comps = [arbeid('r1', 0.22), arbeid('r2', 0.86)]
  const rijen = bouwUrenRijen(groepen, regels, comps)

  it('boomvolgorde met eigen uren per groep', () => {
    expect(rijen.map(r => r.groep.id)).toEqual(['h', 'k', 'd', 'oa'])
    expect(rijen[1].eigenUren).toBeCloseTo(26.4)
    expect(rijen[0].eigenUren).toBe(0)
  })

  it('hoofdgroep telt de subgroepen op, met hun eigen toeslag', () => {
    const pct = new Map([['k', 13.6], ['d', -12.8]])
    const t = totaalVan('h', rijen, pct)
    expect(t.normUren).toBeCloseTo(35)
    expect(t.calcUren).toBeCloseTo(26.4 * 1.136 + 8.6 * 0.872)
    expect(t.metToeslag).toBe(2)
    expect(t.kostVerschil).toBeCloseTo(26.4 * 58 * 0.136 - 8.6 * 58 * 0.128)
    expect(totaalVan('oa', rijen, pct).normUren).toBe(0)
  })
})
