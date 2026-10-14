import { describe, expect, it } from 'vitest'
import {
  bepaalStappen, besluitRegel, kiesDossierRol, kiesGrootboek, korteDatumTijd, ontleedGrootboekNaam, regelVoorDivisie,
  voegRegelToe, type GoedkeurRegel, type ProjectRoute,
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

const pr = (rollen: ProjectRoute['rollen'] = ['projectleider'], drempel: number | null = null, tweede: string | null = null): ProjectRoute =>
  ({ rollen, drempel_excl: drempel, drempel_goedkeurder_id: tweede })

describe('kiesDossierRol', () => {
  it('eerste ingevulde rol in de volgorde wint', () => {
    expect(kiesDossierRol(['teamleider', 'projectleider'], { projectleider: 'pl', teamleider: null })).toEqual({ rol: 'projectleider', id: 'pl' })
    expect(kiesDossierRol(['teamleider', 'projectleider'], { projectleider: 'pl', teamleider: 'tl' })).toEqual({ rol: 'teamleider', id: 'tl' })
    expect(kiesDossierRol(['uitvoerder'], { projectleider: 'pl' })).toBeNull()
  })
})

describe('bepaalStappen', () => {
  it('projectfactuur: de gekozen rol, onder de projectdrempel één stap', () => {
    expect(bepaalStappen({ project: { rol: { rol: 'projectleider', id: 'pl' }, route: pr() }, bedragExcl: 234.87, regel: standaard }))
      .toEqual([{ stap: 1, soort: 'projectleider', goedkeurder_id: 'pl' }])
  })
  it('projectfactuur zonder ingevulde rol: de vaste goedkeurder', () => {
    expect(bepaalStappen({ project: { rol: null, route: pr() }, bedragExcl: 10, regel: standaard })[0])
      .toEqual({ stap: 1, soort: 'terugval', goedkeurder_id: 'robert' })
  })
  it('projecten gebruiken hun eigen drempel, niet die van de administratie', () => {
    const geenProjectDrempel = bepaalStappen({ project: { rol: { rol: 'teamleider', id: 'tl' }, route: pr(['teamleider']) }, bedragExcl: 9000, regel: standaard })
    expect(geenProjectDrempel).toHaveLength(1)
    const s = bepaalStappen({ project: { rol: { rol: 'teamleider', id: 'tl' }, route: pr(['teamleider'], 1000, 'tom') }, bedragExcl: 1000, regel: standaard })
    expect(s[1]).toEqual({ stap: 2, soort: 'drempel', goedkeurder_id: 'tom' })
  })
  it('overhead zonder grootboekgoedkeurder: de vaste goedkeurder', () => {
    expect(bepaalStappen({ project: null, bedragExcl: 10, regel: standaard })[0])
      .toEqual({ stap: 1, soort: 'terugval', goedkeurder_id: 'robert' })
  })
  it('overhead op of boven de drempel van de administratie: tweede stap', () => {
    const s = bepaalStappen({ project: null, bedragExcl: 5000, regel: standaard })
    expect(s[1]).toEqual({ stap: 2, soort: 'drempel', goedkeurder_id: 'directie-1' })
  })
  it('geen tweede stap als het dezelfde persoon is', () => {
    expect(bepaalStappen({ project: null, grootboekGoedkeurderId: 'directie-1', bedragExcl: 9000, regel: standaard })).toHaveLength(1)
  })
  it('drempel zonder aangewezen persoon: stap voor Directie (null)', () => {
    const s = bepaalStappen({ project: null, bedragExcl: 9000, regel: { ...standaard, drempel_goedkeurder_id: null } })
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

describe('grootboek (overhead)', () => {
  it('ontleedt de Bouw7-naam', () => {
    expect(ontleedGrootboekNaam('(4400) Autokosten direkt personeel')).toEqual({ nummer: '4400', naam: 'Autokosten direkt personeel' })
    expect(ontleedGrootboekNaam('Iets zonder nummer')).toEqual({ nummer: null, naam: 'Iets zonder nummer' })
  })
  it('alleen 4xxx telt, hoogste bedrag wint', () => {
    expect(kiesGrootboek([
      { nummer: '6200', naam: 'Materiaal', bedrag: 9000 },
      { nummer: '4400', naam: 'Auto', bedrag: 100 },
      { nummer: '4350', naam: 'Software', bedrag: 80 },
      { nummer: '4350', naam: 'Software', bedrag: 80 },
    ])).toEqual({ nummer: '4350', naam: 'Software' })
    expect(kiesGrootboek([{ nummer: '0300', naam: 'Computers', bedrag: 500 }])).toBeNull()
  })
  it('creditregels tellen op hun absolute bedrag', () => {
    expect(kiesGrootboek([{ nummer: '4400', naam: 'Auto', bedrag: -300 }, { nummer: '4350', naam: 'Software', bedrag: 200 }])?.nummer).toBe('4400')
  })
  it('overhead met grootboekgoedkeurder; bij een project telt het grootboek niet', () => {
    expect(bepaalStappen({ project: null, grootboekGoedkeurderId: 'bas', bedragExcl: 10, regel: standaard })[0])
      .toEqual({ stap: 1, soort: 'grootboek', goedkeurder_id: 'bas' })
    expect(bepaalStappen({ project: { rol: null, route: pr() }, grootboekGoedkeurderId: 'bas', bedragExcl: 10, regel: standaard })[0].soort)
      .toBe('terugval')
  })
})
