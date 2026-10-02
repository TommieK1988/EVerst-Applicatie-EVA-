import { describe, expect, it } from 'vitest'
import { opRegie } from './types'
import { isRegieOpdrachtRij, metGeboekteCodes } from '@/lib/dossiers/regie-opdracht'

describe('opRegie', () => {
  it('negeert de standaardwaarde regie op een opdracht', () => {
    // Zo staan alle ~700 opdrachten in de database: regie, maar nooit bewust gekozen.
    expect(opRegie({ facturatiemethode: 'regie', facturatiemethode_handmatig: false })).toBe(false)
  })

  it('telt op een opdracht pas als iemand hem bewust zette', () => {
    expect(opRegie({ facturatiemethode: 'regie', facturatiemethode_handmatig: true })).toBe(true)
    expect(opRegie({ facturatiemethode: 'termijnen', facturatiemethode_handmatig: true })).toBe(false)
  })

  it('volgt op een servicedeskbon gewoon de kolom, zoals altijd', () => {
    const bon = { bouw7_categorie_naam: 'Dagelijks onderhoud', facturatiemethode_handmatig: false }
    expect(opRegie({ ...bon, facturatiemethode: 'regie' })).toBe(true)
    expect(opRegie({ ...bon, facturatiemethode: null })).toBe(true)
    expect(opRegie({ ...bon, facturatiemethode: 'termijnen' })).toBe(false)
    expect(opRegie({ servicedesk_substatus: 'nieuw', facturatiemethode: 'regie' })).toBe(true)
  })

  it('is onwaar zonder dossier', () => {
    expect(opRegie(null)).toBe(false)
  })
})

describe('isRegieOpdrachtRij', () => {
  it('is alleen een opdracht op regie, nooit een bon', () => {
    expect(isRegieOpdrachtRij({ facturatiemethode: 'regie', facturatiemethode_handmatig: true })).toBe(true)
    expect(isRegieOpdrachtRij({
      facturatiemethode: 'regie', facturatiemethode_handmatig: true, bouw7_categorie_naam: 'Mutatie',
    })).toBe(false)
  })
})

describe('metGeboekteCodes', () => {
  const meerwerk = {
    bewakingscode: 'MW01', bron: 'meerwerk' as const, bronId: 'x', omschrijving: 'Extra kozijn',
    alleenVerschil: false, opslagPct: null, inBouw7: true, mandaat: null,
  }

  it('voegt elke geboekte code toe als regie, één keer', () => {
    const uit = metGeboekteCodes([meerwerk], ['B02', 'A01', 'B02', null, 'MW01'])
    expect(uit.map(c => [c.bewakingscode, c.bron])).toEqual([
      ['A01', 'regie'], ['B02', 'regie'], ['MW01', 'meerwerk'],
    ])
  })

  it('laat de correctiecode buiten de factuur', () => {
    expect(metGeboekteCodes([], ['CO01', 'A01']).map(c => c.bewakingscode)).toEqual(['A01'])
  })
})
