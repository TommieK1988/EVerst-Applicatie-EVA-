import { describe, expect, it } from 'vitest'
import {
  bepaalStappen, besluitRegel, korteDatumTijd, regelVoorDivisie, voegRegelToe, type GoedkeurRegel,
} from './goedkeur-route'

const standaard: GoedkeurRegel = {
  divisie_bouw7_id: null, terugval_goedkeurder_id: 'robert', drempel_excl: 5000, drempel_goedkeurder_id: 'directie-1',
}

describe('regelVoorDivisie', () => {
  it('valt per veld terug op de standaard', () => {
    const eigen: GoedkeurRegel = { divisie_bouw7_id: 3546, terugval_goedkeurder_id: 'richard', drempel_excl: null, drempel_goedkeurder_id: null }
    expect(regelVoorDivisie([standaard, eigen], 3546)).toEqual({
      divisie_bouw7_id: 3546, terugval_goedkeurder_id: 'richard', drempel_excl: 5000, drempel_goedkeurder_id: 'directie-1',
    })
  })
  it('zonder regels: niemand en geen drempel', () => {
    expect(regelVoorDivisie([], 1)).toEqual({ divisie_bouw7_id: 1, terugval_goedkeurder_id: null, drempel_excl: null, drempel_goedkeurder_id: null })
  })
})

describe('bepaalStappen', () => {
  it('projectleider onder de drempel: één stap', () => {
    expect(bepaalStappen({ projectleiderId: 'pl', bedragExcl: 234.87, regel: standaard }))
      .toEqual([{ stap: 1, soort: 'projectleider', goedkeurder_id: 'pl' }])
  })
  it('zonder projectleider: de vaste goedkeurder', () => {
    expect(bepaalStappen({ projectleiderId: null, bedragExcl: 10, regel: standaard })[0])
      .toEqual({ stap: 1, soort: 'terugval', goedkeurder_id: 'robert' })
  })
  it('op of boven de drempel: tweede stap', () => {
    const s = bepaalStappen({ projectleiderId: 'pl', bedragExcl: 5000, regel: standaard })
    expect(s).toHaveLength(2)
    expect(s[1]).toEqual({ stap: 2, soort: 'drempel', goedkeurder_id: 'directie-1' })
  })
  it('geen tweede stap als het dezelfde persoon is', () => {
    expect(bepaalStappen({ projectleiderId: 'directie-1', bedragExcl: 9000, regel: standaard })).toHaveLength(1)
  })
  it('drempel zonder aangewezen persoon: stap voor Directie (null)', () => {
    const s = bepaalStappen({ projectleiderId: 'pl', bedragExcl: 9000, regel: { ...standaard, drempel_goedkeurder_id: null } })
    expect(s[1].goedkeurder_id).toBeNull()
  })
})

describe('tekstregel voor Bouw7', () => {
  it('korte datum zoals de administratie hem schrijft', () => {
    expect(korteDatumTijd('2026-10-13', '14:32:07')).toBe('13-10-26 14:32')
  })
  it('besluitregel met namen en toelichting', () => {
    expect(besluitRegel({ besluit: 'goedgekeurd', namen: ['Richard de Groot', 'Tom Kamminga'], datumTijd: '13-10-26 14:32', toelichting: ' klopt\nmet bon ' }))
      .toBe('Goedgekeurd in EVA door Richard de Groot en Tom Kamminga, 13-10-26 14:32 – klopt met bon')
    expect(besluitRegel({ besluit: 'afgekeurd', namen: ['Robert'], datumTijd: '1-2-27 09:05' }))
      .toBe('Afgekeurd in EVA door Robert, 1-2-27 09:05')
  })
  it('vult aan zonder bestaande tekst te overschrijven, en niet dubbel', () => {
    const regel = 'Goedgekeurd in EVA door X, 13-10-26 14:32'
    expect(voegRegelToe('REF. : JOHN', regel)).toBe(`REF. : JOHN\n${regel}`)
    expect(voegRegelToe('', regel)).toBe(regel)
    expect(voegRegelToe(null, regel)).toBe(regel)
    expect(voegRegelToe(`REF. : JOHN\n${regel}`, regel)).toBe(`REF. : JOHN\n${regel}`)
  })
})
