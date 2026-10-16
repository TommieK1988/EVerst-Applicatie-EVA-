import { describe, it, expect } from 'vitest'
import { bakVan, kortDatum, kortStap, pastBijBedrag, pastBijZoekterm, sorteerOverige, sorteerTeDoen, stilstandPerReden, type TeDoenRij } from './te-doen'

describe('kortStap', () => {
  it('schrijft de stap kort op, met het jaartal alleen als het een ander jaar is', () => {
    expect(kortStap({ stap_soort: 'actie', stap_tekst: 'Offerte toelichten', stap_datum: '2026-10-16', wacht_op: null }, '2026-10-15'))
      .toBe('Offerte toelichten · 16 okt')
    expect(kortStap({ stap_soort: 'wachten', stap_tekst: 'Besluit ALV', stap_datum: '2027-03-18', wacht_op: 'klant' }, '2026-10-15'))
      .toBe('Wacht op klant tot 18 mrt 2027 · Besluit ALV')
    expect(kortDatum('2026-01-05T09:00:00Z', '2026-10-15')).toBe('5 jan')
  })
})

describe('pastBijZoekterm', () => {
  const r = { titel: 'Gevelonderhoud', klant_naam: 'VvE Laan van Meerdervoort 210', dossiernummer: 'D-26-0371', contactpersoon_naam: 'P. de Wit' } as TeDoenRij
  it('zoekt op klant, nummer en contactpersoon, hoofdletterongevoelig', () => {
    expect(pastBijZoekterm(r, 'meerdervoort')).toBe(true)
    expect(pastBijZoekterm(r, '0371')).toBe(true)
    expect(pastBijZoekterm(r, 'de wit')).toBe(true)
    expect(pastBijZoekterm(r, 'staedion')).toBe(false)
    expect(pastBijZoekterm(r, '  ')).toBe(true)
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

describe('sorteerOverige', () => {
  it('zelfde VvE eerst, dan urgentie, dan bedrag', () => {
    const r = (id: string, klant: string, bak: TeDoenRij['_bak'], bedrag: number) =>
      ({ id, klant_naam: klant, _bak: bak, _bedrag: bedrag }) as TeDoenRij
    const uit = sorteerOverige([
      r('a', 'VvE Buitenhof', 'later', 90_000),
      r('b', 'VvE Buitenhof', 'verlopen', 5_000),
      r('c', 'VvE De Kroonvogel', 'later', 1_000),
      r('d', 'VvE Hof van Delfland', 'verlopen', 20_000),
    ], 'VvE De Kroonvogel').map(x => x.id)
    expect(uit).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('pastBijBedrag', () => {
  const klassen = { mega: true, groot: true, middel: true, klein: false }
  const vrij = { min: null, max: null }
  const r = (klasse: TeDoenRij['_klasse'], bedrag: number, opvolging: 'altijd' | 'niet' | null = null) =>
    ({ _klasse: klasse, _bedrag: bedrag, bewaking_opvolging: opvolging })
  it('volgt de klasse, maar de keuze op de offerte gaat voor', () => {
    expect(pastBijBedrag(r('klein', 1_500), klassen, vrij)).toBe(false)
    expect(pastBijBedrag(r('klein', 1_500, 'altijd'), klassen, vrij)).toBe(true)
    expect(pastBijBedrag(r('groot', 60_000, 'niet'), klassen, vrij)).toBe(false)
    expect(pastBijBedrag(r('groot', 60_000), klassen, { min: 70_000, max: null })).toBe(false)
  })
})

describe('stilstandPerReden', () => {
  it('telt per reden, grootste bedrag eerst, met het eerste besluit', () => {
    const r = (stil: TeDoenRij['_stil'], bedrag: number, besluit: string | null) =>
      ({ _stil: stil, _bedrag: bedrag, bewaking_besluit_datum: besluit }) as TeDoenRij
    const uit = stilstandPerReden([
      r('besluit_alv', 80_000, '2027-03-18'),
      r('besluit_alv', 20_000, '2026-11-20'),
      r('klant_beoordeelt', 5_000, null),
      r(null, 9_000, null),
    ])
    expect(uit).toEqual([
      { reden: 'besluit_alv', label: 'Besluit ALV/bestuur', aantal: 2, bedrag: 100_000, eersteBesluit: '2026-11-20' },
      { reden: 'klant_beoordeelt', label: 'Klant beoordeelt', aantal: 1, bedrag: 5_000, eersteBesluit: null },
    ])
  })
})
