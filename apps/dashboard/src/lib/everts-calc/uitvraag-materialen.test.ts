import { describe, expect, it } from 'vitest'
import type { Calculatieregel, Componentregel } from './types'
import { materialenUitSelectie } from './uitvraag-weergave'

const regel = (id: string, hoeveelheid: number, extra: Partial<Calculatieregel> = {}) =>
  ({ id, groep_id: 'g', volgorde: 0, omschrijving: `Post ${id}`, hoeveelheid, eenheid: 'm2', ...extra }) as Calculatieregel
const mat = (id: string, regelId: string, norm: number, omschrijving?: string, eenheid?: string) =>
  ({ id, calculatieregel_id: regelId, type: 'materieel', norm_hoeveelheid: norm, tarief: 10, omschrijving, eenheid }) as Componentregel

describe('materialenUitSelectie', () => {
  it('norm × hoeveelheid, gelijke materialen opgeteld, arbeid en niet-geselecteerde posten eruit', () => {
    const lijst = materialenUitSelectie(['a', 'b'],
      [regel('a', 10), regel('b', 5), regel('c', 100)],
      [
        mat('1', 'a', 0.1, 'Dekkende lak', 'ltr'),
        mat('2', 'b', 0.2, 'dekkende lak', 'ltr'),
        mat('3', 'c', 1, 'Dekkende lak', 'ltr'),
        { id: '4', calculatieregel_id: 'a', type: 'arbeid', norm_hoeveelheid: 0.5, tarief: 58 } as Componentregel,
      ])
    expect(lijst).toEqual([{ calculatieregel_id: '', omschrijving: 'Dekkende lak', hoeveelheid: 2, eenheid: 'ltr' }])
  })

  it('norm zonder omschrijving krijgt die van de post; zonder eenheid blijft leeg', () => {
    const lijst = materialenUitSelectie(['a'], [regel('a', 3, { omschrijving: 'Kozijnen schilderen' })], [mat('1', 'a', 2)])
    expect(lijst).toEqual([{ calculatieregel_id: '', omschrijving: 'Materiaal voor: Kozijnen schilderen', hoeveelheid: 6, eenheid: null }])
  })

  it('zelfde materiaal met een andere eenheid blijft apart', () => {
    const lijst = materialenUitSelectie(['a'], [regel('a', 1)], [mat('1', 'a', 1, 'Kit', 'st'), mat('2', 'a', 1, 'Kit', 'doos')])
    expect(lijst.map(p => p.eenheid)).toEqual(['st', 'doos'])
  })
})
