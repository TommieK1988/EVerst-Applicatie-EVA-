import { describe, expect, it } from 'vitest'
import { bepaalKantoorOpties, type WerkmaatschappijRij } from './kantoor-opties'

const WM: WerkmaatschappijRij[] = [
  { id: 'bbm', naam: 'Bouwbedrijf Morgenstond B.V.', indirect_gewerkt_dossier_id: 'd-bbm' },
  { id: 'eos', naam: 'Everts Onderhoudsschilders B.V.', indirect_gewerkt_dossier_id: 'd-eos' },
  { id: 'dak', naam: 'Dakplan', indirect_gewerkt_dossier_id: null },
]

describe('bepaalKantoorOpties', () => {
  it('niets aangevinkt: alleen de standaardplek van vandaag', () => {
    expect(bepaalKantoorOpties([], WM, 'd-std')).toEqual([{ dossierId: 'd-std', label: '' }])
  })

  it('niets aangevinkt en geen standaard: geen opties', () => {
    expect(bepaalKantoorOpties([], WM, null)).toEqual([])
  })

  it('één aangevinkt: die vervangt de standaard', () => {
    expect(bepaalKantoorOpties(['bbm'], WM, 'd-std')).toEqual([
      { dossierId: 'd-bbm', label: 'Bouwbedrijf Morgenstond B.V.' },
    ])
  })

  it('twee aangevinkt: beide, in aangevinkte volgorde', () => {
    expect(bepaalKantoorOpties(['eos', 'bbm'], WM, 'd-std').map(o => o.dossierId)).toEqual(['d-eos', 'd-bbm'])
  })

  it('werkmaatschappij zonder gewerkt-project of onbekend id valt weg', () => {
    expect(bepaalKantoorOpties(['dak', 'bbm', 'weg'], WM, 'd-std').map(o => o.dossierId)).toEqual(['d-bbm'])
  })

  it('blijft er niets over, dan alsnog de standaardplek', () => {
    expect(bepaalKantoorOpties(['dak'], WM, 'd-std')).toEqual([{ dossierId: 'd-std', label: '' }])
  })
})
