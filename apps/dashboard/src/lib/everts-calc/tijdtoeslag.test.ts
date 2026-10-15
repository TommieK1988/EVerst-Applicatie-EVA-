import { describe, it, expect } from 'vitest'
import { begrensToeslag, maakTijdfactor, metTijdtoeslag, tijdfactor, toeslagLabel, toeslagVoorUren } from './tijdtoeslag'
import { berekenCalculatieregel, berekenGroepUren, berekenGroepKostprijs, berekenScenarioVP, berekenBtwBreakdown } from './calculations'
import type { Calculatieregel, Componentregel, Groep } from './types'

const groep = (id: string, extra: Partial<Groep> = {}): Groep =>
  ({ id, scenario_id: 's', parent_id: null, naam: id, niveau: 1, volgorde: 0, ...extra })
const regel = (id: string, groep_id: string, hoeveelheid = 100): Calculatieregel =>
  ({ id, groep_id, omschrijving: id, hoeveelheid, eenheid: 'm1', volgorde: 0 })
const comp = (id: string, rid: string, type: Componentregel['type'], norm: number, tarief: number): Componentregel =>
  ({ id, calculatieregel_id: rid, type, norm_hoeveelheid: norm, tarief })

describe('tijdtoeslag', () => {
  it('factor uit het percentage, begrensd op −25 en +50', () => {
    expect(tijdfactor(undefined)).toBe(1)
    expect(tijdfactor({ tijdtoeslag_pct: 0 })).toBe(1)
    expect(tijdfactor({ tijdtoeslag_pct: 10 })).toBeCloseTo(1.1)
    expect(tijdfactor({ tijdtoeslag_pct: 80 })).toBeCloseTo(1.5)
    expect(begrensToeslag(-40)).toBe(-25)
  })

  it('toeslag voor de gewenste uren: 35 u wordt een week van 37,5 u', () => {
    expect(toeslagVoorUren(35, 37.5)).toBeCloseTo(7.142857, 5)
    expect(35 * (1 + toeslagVoorUren(35, 37.5) / 100)).toBeCloseTo(37.5, 4)
    expect(toeslagVoorUren(0, 10)).toBe(0)
    expect(toeslagVoorUren(10, 100)).toBe(50)
  })

  it('label op de groepskop', () => {
    expect(toeslagLabel(13.6)).toBe('+13,6% tijd')
    expect(toeslagLabel(-12.8)).toBe('−12,8% tijd')
    expect(toeslagLabel(0)).toBe('')
  })

  it('telt alleen op arbeid, niet op materiaal of OA, en laat de norm zelf staan', () => {
    const r = regel('r', 'g')
    const comps = [comp('a', 'r', 'arbeid', 0.2, 50), comp('m', 'r', 'materieel', 1, 3), comp('o', 'r', 'onderaanneming', 1, 10)]
    const b = berekenCalculatieregel(r, comps, 0, 1.25)
    expect(b.uren_totaal).toBeCloseTo(25)        // 100 × 0,2 × 1,25
    expect(b.arbeid_totaal).toBeCloseTo(1250)
    expect(b.materieel_totaal).toBeCloseTo(300)
    expect(b.oa_totaal).toBeCloseTo(1000)
    expect(comps[0].norm_hoeveelheid).toBe(0.2)
  })

  it('groeps- en scenariototalen nemen de toeslag van de eigen groep', () => {
    const groepen = [groep('h'), groep('s1', { parent_id: 'h', niveau: 2, tijdtoeslag_pct: 10 }), groep('s2', { parent_id: 'h', niveau: 2 })]
    const regels = [regel('r1', 's1'), regel('r2', 's2')]
    const comps = [comp('a1', 'r1', 'arbeid', 0.2, 50), comp('a2', 'r2', 'arbeid', 0.2, 50)]
    expect(berekenGroepUren('h', groepen, regels, comps)).toBeCloseTo(22 + 20)
    expect(berekenGroepKostprijs('s1', groepen, regels, comps)).toBeCloseTo(1100)
    expect(berekenScenarioVP(groepen, regels, comps, 0)).toBeCloseTo(2100)
    const btw = berekenBtwBreakdown(regels, comps, 0, 21, undefined, groepen)
    expect(btw[0].basis).toBeCloseTo(2100)
  })

  it('metTijdtoeslag geeft effectieve arbeidsnormen voor werkbegroting en export', () => {
    const groepen = [groep('g', { tijdtoeslag_pct: -10 })]
    const regels = [regel('r', 'g')]
    const uit = metTijdtoeslag([comp('a', 'r', 'arbeid', 1, 50), comp('m', 'r', 'materieel', 2, 3)], regels, groepen)
    expect(uit[0].norm_hoeveelheid).toBeCloseTo(0.9)
    expect(uit[1].norm_hoeveelheid).toBe(2)
    expect(maakTijdfactor(groepen)({ groep_id: 'onbekend' })).toBe(1)
  })
})
