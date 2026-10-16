import { describe, expect, it } from 'vitest'
import { bewerkrecht, bewerkrechtUitleg, type RegelRollen } from './bewerkrecht'

const IK = 'ik'
const regel = (r: Partial<RegelRollen> = {}): RegelRollen => ({
  goedgekeurd: false, teamleiderId: 'tl', projectleiderId: 'pl', vasteGoedkeurderId: null, tlAkkoord: false, ...r,
})

describe('bewerkrecht — open regels', () => {
  it('projectleider mag aanpassen, ook als de teamleider nog niet akkoord is', () => {
    expect(bewerkrecht(regel({ projectleiderId: IK }), IK)).toEqual({ mag: 'aanpassen' })
    expect(bewerkrecht(regel({ projectleiderId: IK, tlAkkoord: true }), IK)).toEqual({ mag: 'aanpassen' })
  })

  it('teamleider mag aanpassen zolang hij niet akkoord is, daarna niet meer', () => {
    expect(bewerkrecht(regel({ teamleiderId: IK }), IK)).toEqual({ mag: 'aanpassen' })
    expect(bewerkrecht(regel({ teamleiderId: IK, tlAkkoord: true }), IK)).toEqual({ mag: null, reden: 'alDoorgezet' })
  })

  it('teamleider die ook projectleider is mag altijd', () => {
    expect(bewerkrecht(regel({ teamleiderId: IK, projectleiderId: IK, tlAkkoord: true }), IK)).toEqual({ mag: 'aanpassen' })
  })

  it('wie geen rol heeft op het dossier mag niet', () => {
    expect(bewerkrecht(regel(), IK)).toEqual({ mag: null, reden: 'nietAanZet' })
  })

  it('zonder teamleider en projectleider kan niemand iets', () => {
    expect(bewerkrecht(regel({ teamleiderId: null, projectleiderId: null }), IK)).toEqual({ mag: null, reden: 'geenRollen' })
  })

  it('de eigen goedkeurder vervangt de dossierrollen', () => {
    expect(bewerkrecht(regel({ vasteGoedkeurderId: IK }), IK)).toEqual({ mag: 'aanpassen' })
    expect(bewerkrecht(regel({ vasteGoedkeurderId: 'iemand', projectleiderId: IK }), IK))
      .toEqual({ mag: null, reden: 'nietAanZet' })
  })
})

describe('bewerkrecht — goedgekeurde regels', () => {
  it('alleen de projectleider kan intrekken', () => {
    expect(bewerkrecht(regel({ goedgekeurd: true, projectleiderId: IK }), IK)).toEqual({ mag: 'intrekken' })
    expect(bewerkrecht(regel({ goedgekeurd: true, teamleiderId: IK }), IK)).toEqual({ mag: null, reden: 'alGoedgekeurd' })
  })

  it('bij de route via de eigen goedkeurder kan alleen die intrekken', () => {
    expect(bewerkrecht(regel({ goedgekeurd: true, vasteGoedkeurderId: IK }), IK)).toEqual({ mag: 'intrekken' })
    expect(bewerkrecht(regel({ goedgekeurd: true, vasteGoedkeurderId: 'iemand', projectleiderId: IK }), IK))
      .toEqual({ mag: null, reden: 'alGoedgekeurd' })
  })
})

describe('bewerkrechtUitleg', () => {
  it('noemt wie er aan zet is', () => {
    expect(bewerkrechtUitleg('nietAanZet', { wachtOp: 'Marga' })).toContain('Marga')
    expect(bewerkrechtUitleg('alDoorgezet', { projectleider: 'Chris' })).toContain('Chris')
  })

  it('valt terug op een rol als er geen naam is', () => {
    expect(bewerkrechtUitleg('alGoedgekeurd')).toContain('de projectleider')
    expect(bewerkrechtUitleg('alGoedgekeurd', { viaGoedkeurder: true })).toContain('goedkeurder van deze medewerker')
  })
})
