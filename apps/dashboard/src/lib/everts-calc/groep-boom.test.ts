import { describe, it, expect } from 'vitest'
import { positieNa, verplaatsGroep } from './groep-boom'
import type { Groep } from './types'

const g = (id: string, parent_id: string | null, niveau: 1 | 2 | 3, volgorde: number): Groep =>
  ({ id, scenario_id: 's', parent_id, naam: id, niveau, volgorde })

// 1 Steiger · 2 Schilder (2.1 Kozijnen) · 3 Voegwerk
const boom = [g('steiger', null, 1, 1), g('schilder', null, 1, 2), g('kozijnen', 'schilder', 2, 1), g('voeg', null, 1, 3)]

describe('positieNa', () => {
  it('na de laatste subgroep: als laatste subgroep bij dezelfde ouder', () => {
    expect(positieNa(boom, 'kozijnen', 'voeg')).toEqual({ parentId: 'schilder', diepte: 1, voorGroepId: null })
  })
  it('na een hoofdgroep: vóór de volgende hoofdgroep', () => {
    expect(positieNa(boom, 'steiger', 'voeg')).toEqual({ parentId: null, diepte: 0, voorGroepId: 'schilder' })
  })
  it('slaat de gesleepte groep zelf over', () => {
    expect(positieNa(boom, 'schilder', 'voeg')).toEqual({ parentId: null, diepte: 0, voorGroepId: null })
  })
  it('levert met verplaatsGroep de onderste groep als subgroep onder de laatste subgroep', () => {
    const p = positieNa(boom, 'kozijnen', 'voeg')!
    const gewijzigd = verplaatsGroep(boom, 'voeg', p.parentId, p.voorGroepId)
    const voeg = gewijzigd.find(x => x.id === 'voeg')!
    expect(voeg).toMatchObject({ parent_id: 'schilder', niveau: 2, volgorde: 2 })
  })
})
