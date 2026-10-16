import { describe, expect, it } from 'vitest'
import { routeerKosten, wachtOpBeoordeling, type KostenRouteInvoer } from './onkosten-route'

const basis: KostenRouteInvoer = {
  medewerkerId: 'jan',
  dossierId: 'd1',
  projectleiderId: 'pl',
  indirect: false,
  eigenGoedkeurderId: 'eigen',
  standaardGoedkeurderId: 'standaard',
}

describe('routeerKosten', () => {
  it('kosten voor een project gaan naar de projectleider van dat dossier', () => {
    expect(routeerKosten(basis)).toEqual({ goedkeurderId: 'pl', rol: 'projectleider' })
  })

  it('zonder project: de eigen goedkeurder', () => {
    expect(routeerKosten({ ...basis, dossierId: null })).toEqual({ goedkeurderId: 'eigen', rol: 'goedkeurder' })
  })

  it('op een indirecte-urenproject telt de projectleider niet', () => {
    expect(routeerKosten({ ...basis, indirect: true })).toEqual({ goedkeurderId: 'eigen', rol: 'goedkeurder' })
  })

  it('dossier zonder projectleider: de eigen goedkeurder', () => {
    expect(routeerKosten({ ...basis, projectleiderId: null })).toEqual({ goedkeurderId: 'eigen', rol: 'goedkeurder' })
  })

  it('zonder eigen goedkeurder: de standaardgoedkeurder', () => {
    expect(routeerKosten({ ...basis, dossierId: null, eigenGoedkeurderId: null }))
      .toEqual({ goedkeurderId: 'standaard', rol: 'goedkeurder' })
  })

  it('je eigen kosten keur je niet goed, ook niet als projectleider', () => {
    expect(routeerKosten({ ...basis, projectleiderId: 'jan' })).toEqual({ goedkeurderId: 'eigen', rol: 'goedkeurder' })
    expect(routeerKosten({ ...basis, dossierId: null, eigenGoedkeurderId: 'jan' }))
      .toEqual({ goedkeurderId: 'standaard', rol: 'goedkeurder' })
  })

  it('niemand beschikbaar: niet toe te wijzen', () => {
    expect(routeerKosten({ ...basis, dossierId: null, eigenGoedkeurderId: null, standaardGoedkeurderId: 'jan' }))
      .toEqual({ goedkeurderId: null, rol: null })
  })
})

describe('wachtOpBeoordeling', () => {
  it('alleen open kosten in een ingediende week', () => {
    expect(wachtOpBeoordeling('open', 'ingediend')).toBe(true)
    expect(wachtOpBeoordeling('open', 'goedgekeurd')).toBe(true)
    expect(wachtOpBeoordeling('open', 'concept')).toBe(false)
    expect(wachtOpBeoordeling('open', 'afgekeurd')).toBe(false)
    expect(wachtOpBeoordeling('goedgekeurd', 'ingediend')).toBe(false)
    expect(wachtOpBeoordeling('open', null)).toBe(false)
  })
})
