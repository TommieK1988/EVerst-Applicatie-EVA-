import { describe, it, expect } from 'vitest'
import { bakVan, kortDatum, kortStap, sorteerTeDoen, type TeDoenRij } from './te-doen'

describe('kortStap', () => {
  it('schrijft de stap kort op, met het jaartal alleen als het een ander jaar is', () => {
    expect(kortStap({ stap_soort: 'actie', stap_tekst: 'Offerte toelichten', stap_datum: '2026-10-16', wacht_op: null }, '2026-10-15'))
      .toBe('Offerte toelichten · 16 okt')
    expect(kortStap({ stap_soort: 'wachten', stap_tekst: 'Besluit ALV', stap_datum: '2027-03-18', wacht_op: 'klant' }, '2026-10-15'))
      .toBe('Wacht op klant tot 18 mrt 2027 · Besluit ALV')
    expect(kortDatum('2026-01-05T09:00:00Z', '2026-10-15')).toBe('5 jan')
  })
})

describe('bakVan', () => {
  it('deelt in op urgentie', () => {
    expect(bakVan('verlopen', -2)).toBe('verlopen')
    expect(bakVan('nu', 0)).toBe('vandaag')
    expect(bakVan('ongetrieerd', null)).toBe('ongetrieerd')
    expect(bakVan('op_schema', 3)).toBe('week')
    expect(bakVan('wacht_klant', 6)).toBe('week')
    expect(bakVan('wacht_klant', 20)).toBe('later')
    expect(bakVan('slapend', 120)).toBe('later')
    expect(bakVan('afgerond', null)).toBeNull()
  })
})

describe('sorteerTeDoen', () => {
  const rij = (id: string, bak: TeDoenRij['_bak'], dagen: number | null, bedrag: number) =>
    ({ id, _bak: bak, _dagen: dagen, _bedrag: bedrag }) as TeDoenRij

  it('groep eerst, dan het eerst verlopen, dan het hoogste bedrag', () => {
    const uit = [
      rij('later', 'later', 30, 90_000),
      rij('kort-verlopen', 'verlopen', -1, 5_000),
      rij('lang-verlopen', 'verlopen', -9, 5_000),
      rij('vandaag-klein', 'vandaag', 0, 2_000),
      rij('vandaag-groot', 'vandaag', 0, 60_000),
    ].sort(sorteerTeDoen).map(r => r.id)
    expect(uit).toEqual(['lang-verlopen', 'kort-verlopen', 'vandaag-groot', 'vandaag-klein', 'later'])
  })
})
