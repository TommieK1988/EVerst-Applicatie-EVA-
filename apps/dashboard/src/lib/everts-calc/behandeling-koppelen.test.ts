import { describe, it, expect } from 'vitest'
import { groepeerPerBestekcode, planKoppeling, benodigdeTypeIds, ZONDER_CODE } from './behandeling-koppelen'
import { aggregaatSleutel, calculatieregelOmschrijving, normaliseerBestekcode } from './meetstaat-utils'
import { componentregelsUitCombinatie } from './normen-uit-combinatie'
import type { Calculatieregel, Meetregel, MeetregelAggregaat } from './types'
import type { SchilderCombinatie } from './services/schilderwerk'

/**
 * Bestekscode in de meetstaat en het koppelen van een behandeling per code.
 *
 * De opnemer noteert per regel een bestekscode; elk cumulatief (Kozijnen hout 10-20cm)
 * splitst daarop. In de calculatie koppel je per code in één keer een behandeling.
 */

function meetregel(p: Partial<Meetregel>): Meetregel {
  return {
    id: 'm1', meetstaat_id: 'ms', groep_id: 'g1', volgorde: 1,
    onderdeel: 'Kozijnen hout', type: '10-20cm', breedte: 1, hoogte: 1, aantal: 1, eenheid: 'm²',
    is_leeg: false, aangepast_op: '', ...p,
  }
}

function agg(p: Partial<MeetregelAggregaat> & { id: string }): MeetregelAggregaat {
  return {
    meetstaat_id: 'ms', groep_id: 'g1', onderdeel: 'Kozijnen hout', type: '10-20cm', behandeling: '',
    type_id: 't-kozijn', totaal_hoeveelheid: 10, eenheid: 'm¹', is_gesynchroniseerd: true, aangepast_op: '', ...p,
  }
}

function regel(p: Partial<Calculatieregel> & { id: string }): Calculatieregel {
  return { groep_id: 'g1', omschrijving: '', hoeveelheid: 10, eenheid: 'm¹', volgorde: 1, ...p }
}

function combinatie(type_id: string, behandeling_id: string): SchilderCombinatie {
  return {
    id: `${type_id}-${behandeling_id}`, onderdeel_id: 'o', type_id, behandeling_id,
    behandeling: { id: behandeling_id, naam: 'OHD 03' } as SchilderCombinatie['behandeling'],
    arbeid_normen: [{ id: 'a', combinatie_id: '', omschrijving: 'Schilder', minutes_per_unit: 30, hour_rate: 50, cost_per_unit: 25, unit: 'm¹', volgorde: 1 }],
    materiaal_normen: [
      { id: 'v', combinatie_id: '', naam: 'Verf', norm_type: 'materiaal', quantity_per_unit: 0.1, eenheid: 'ltr', unit_price: 20, cost_per_unit: 2, volgorde: 1 },
      { id: 'n', combinatie_id: '', naam: 'Gratis', norm_type: 'materiaal', quantity_per_unit: 1, eenheid: 'st', unit_price: 0, cost_per_unit: 0, volgorde: 2 },
    ],
  }
}

describe('bestekscode in de meetstaat', () => {
  it('normaliseert schrijfwijzen naar één code', () => {
    expect(normaliseerBestekcode(' s-01 ')).toBe('S-01')
    expect(normaliseerBestekcode('s  01')).toBe('S 01')
    expect(normaliseerBestekcode('S:01')).toBe('S01')
    expect(normaliseerBestekcode(undefined)).toBe('')
  })

  it('splitst hetzelfde onderdeel/type op code', () => {
    const a = aggregaatSleutel(meetregel({ bestekcode: 'S-01' }))
    const b = aggregaatSleutel(meetregel({ bestekcode: 's-01 ' }))
    const c = aggregaatSleutel(meetregel({ bestekcode: 'S-02' }))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('houdt voor een oude regel met behandeling een eigen sleutel', () => {
    const oud = aggregaatSleutel(meetregel({ behandeling: 'OHD 03' }))
    const nieuw = aggregaatSleutel(meetregel({}))
    expect(oud).not.toBe(nieuw)
    expect(oud?.endsWith('::ohd 03')).toBe(true)
  })

  it('bouwt de omschrijving met code en zonder lege behandeling', () => {
    expect(calculatieregelOmschrijving('Kozijnen hout', '10-20cm', '', 's-01')).toBe('Kozijnen hout - 10-20cm [S-01]')
    expect(calculatieregelOmschrijving('Kozijnen hout', '10-20cm', 'OHD 03', 'S-01')).toBe('Kozijnen hout - 10-20cm [S-01] : OHD 03')
    expect(calculatieregelOmschrijving('Kozijnen hout', '', 'OHD 03')).toBe('Kozijnen hout : OHD 03')
  })
})

describe('groeperen per onderdeel, type en code', () => {
  const aggs = [
    agg({ id: 'a1' }),
    agg({ id: 'a2', onderdeel: 'Boeideel hout', type: '>20cm' }),
    agg({ id: 'a3' }),
    agg({ id: 'a4', groep_id: 'g2' }),
  ]
  const regels = [
    regel({ id: 'r1', meetstaat_aggregaat_id: 'a1', bestekcode: 'S-10' }),
    regel({ id: 'r2', meetstaat_aggregaat_id: 'a2', bestekcode: 'S-10', schilderbehandeling_id: 'b1' }),
    regel({ id: 'r3', meetstaat_aggregaat_id: 'a3' }),
    regel({ id: 'r4', meetstaat_aggregaat_id: 'a1', bestekcode: 'S-2', schilderbehandeling_id: 'b1' }),
    regel({ id: 'r5', meetstaat_aggregaat_id: 'a4', bestekcode: 'S-10', schilderbehandeling_id: 'b1' }),
    regel({ id: 'handmatig', omschrijving: 'Bouwplaatskosten' }),
    regel({ id: 'tekst', soort: 'tekst', meetstaat_aggregaat_id: 'a1' }),
  ]
  const groepen = groepeerPerBestekcode(regels, aggs)
  const label = (g: (typeof groepen)[number]) => `${g.onderdeel} ${g.type} ${g.code || '-'}`

  it('houdt verschillende onderdelen met dezelfde code apart', () => {
    expect(groepen.map(label)).toEqual([
      'Boeideel hout >20cm S-10',
      'Kozijnen hout 10-20cm S-2',
      'Kozijnen hout 10-20cm S-10',
      'Kozijnen hout 10-20cm -',
    ])
  })

  it('telt dezelfde post over groepen (locaties) heen samen', () => {
    const kozijnS10 = groepen.find(g => label(g) === 'Kozijnen hout 10-20cm S-10')!
    expect(kozijnS10.regels.map(r => r.id)).toEqual(['r1', 'r5'])
    expect(kozijnS10.behandelingIds).toEqual([null, 'b1'])
  })

  it('neemt alleen regels uit de meetstaat mee', () => {
    const alle = groepen.flatMap(g => g.regels.map(r => r.id))
    expect(alle).not.toContain('handmatig')
    expect(alle).not.toContain('tekst')
    expect(groepen.find(g => g.code === ZONDER_CODE)?.regels.map(r => r.id)).toEqual(['r3'])
  })

  it('weet welke types het nodig heeft', () => {
    expect(benodigdeTypeIds(regels, aggs)).toEqual(['t-kozijn'])
  })
})

describe('koppelen', () => {
  const aggs = [agg({ id: 'a1' }), agg({ id: 'a2', onderdeel: 'Boeideel hout', type: '>20cm', type_id: 't-boeideel' })]
  const regels = [
    regel({ id: 'r1', meetstaat_aggregaat_id: 'a1', bestekcode: 'S-01' }),
    regel({ id: 'r2', meetstaat_aggregaat_id: 'a2', bestekcode: 'S-01' }),
  ]
  const combinaties = new Map([['t-kozijn', [combinatie('t-kozijn', 'b1')]]])
  const stappen = planKoppeling(regels, aggs, combinaties, { id: 'b1', naam: 'OHD 03' })

  it('koppelt de behandeling en vindt de combinatie', () => {
    expect(stappen[0].combinatie?.id).toBe('t-kozijn-b1')
    expect(stappen[0].nieuw.schilderbehandeling_id).toBe('b1')
    expect(stappen[0].nieuw.omschrijving).toBe('Kozijnen hout - 10-20cm [S-01] : OHD 03')
    expect(stappen[0].nieuw.gemarkeerd).toBeFalsy()
  })

  it('koppelt zonder combinatie toch de tekst, en markeert de regel', () => {
    expect(stappen[1].combinatie).toBeNull()
    expect(stappen[1].nieuw.schilderbehandeling_id).toBe('b1')
    expect(stappen[1].nieuw.gemarkeerd).toBe(true)
    expect(stappen[1].label).toBe('Boeideel hout >20cm')
  })

  it('bouwt normen uit de combinatie en laat normen zonder kosten weg', () => {
    const comps = componentregelsUitCombinatie('r1', combinatie('t-kozijn', 'b1'))
    expect(comps.map(c => c.type)).toEqual(['arbeid', 'materieel'])
    expect(comps[0].norm_hoeveelheid).toBe(0.5)
    expect(comps.every(c => c.calculatieregel_id === 'r1')).toBe(true)
  })
})
