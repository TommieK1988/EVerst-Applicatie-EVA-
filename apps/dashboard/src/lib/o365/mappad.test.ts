import { describe, expect, it } from 'vitest'
import { bestandPadInMap, mapPadDelen } from './mappad'

describe('mapPadDelen', () => {
  it('geeft een lege lijst voor de dossiermap zelf', () => {
    expect(mapPadDelen('')).toEqual([])
  })

  it('knipt een geldig pad op, ook met spaties, apostrof en #', () => {
    expect(mapPadDelen("Foto's opname/Revisie #2")).toEqual(["Foto's opname", 'Revisie #2'])
  })

  it('weigert alles waarmee je uit de dossiermap zou kunnen', () => {
    expect(mapPadDelen('..')).toBeNull()
    expect(mapPadDelen('Tekeningen/../..')).toBeNull()
    expect(mapPadDelen('./Tekeningen')).toBeNull()
  })

  it('weigert lege delen en verboden tekens', () => {
    expect(mapPadDelen('/Tekeningen')).toBeNull()
    expect(mapPadDelen('Tekeningen//Revisie')).toBeNull()
    expect(mapPadDelen('  ')).toBeNull()
    expect(mapPadDelen('Teke:ningen')).toBeNull()
    expect(mapPadDelen('Tekeningen\\Revisie')).toBeNull()
  })

  it('weigert een pad dat dieper gaat dan de lijst ooit toont', () => {
    expect(mapPadDelen(Array.from({ length: 8 }, (_, i) => `m${i}`).join('/'))).toBeNull()
    expect(mapPadDelen(Array.from({ length: 7 }, (_, i) => `m${i}`).join('/'))).toHaveLength(7)
  })
})

describe('bestandPadInMap', () => {
  it('codeert elk deel apart en houdt de scheidingstekens', () => {
    expect(bestandPadInMap('d1', 'm1', ["Foto's", 'Revisie #2'], 'plan a.pdf'))
      .toBe("/drives/d1/items/m1:/Foto's/Revisie%20%232/plan%20a.pdf:")
  })

  it('zet een bestand zonder submap direct in de map', () => {
    expect(bestandPadInMap('d1', 'm1', [], 'plan.pdf')).toBe('/drives/d1/items/m1:/plan.pdf:')
  })
})
