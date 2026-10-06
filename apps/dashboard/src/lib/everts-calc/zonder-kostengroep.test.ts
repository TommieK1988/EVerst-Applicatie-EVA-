import { describe, expect, it } from 'vitest'
import { regelsZonderKostengroep, meldingZonderKostengroep } from './zonder-kostengroep'

const regel = (id: string, kostengroep: string | undefined, extra: { is_verwijderd?: boolean } = {}) =>
  ({ id, kostengroep, hoeveelheid: 1, omschrijving: '', ...extra })
const comp = (id: string, regelId: string, tarief: number, extra: { is_verwijderd?: boolean; omschrijving?: string } = {}) =>
  ({ id, werkbegroting_regel_id: regelId, norm_hoeveelheid: 1, tarief, ...extra })

describe('regelsZonderKostengroep', () => {
  it('vindt een component met bedrag op een regel zonder kostengroep', () => {
    const uit = regelsZonderKostengroep(
      [regel('r1', undefined), regel('r2', 'BP.A — Bouwplaatsvoorzieningen')],
      [comp('c1', 'r1', 3300, { omschrijving: 'Diverse uitvoeringsvoorzieningen' }), comp('c2', 'r2', 500)],
    )
    expect(uit).toEqual([{ componentId: 'c1', omschrijving: 'Diverse uitvoeringsvoorzieningen', bedrag: 3300 }])
  })

  it('negeert verwijderde regels/componenten en regels zonder bedrag', () => {
    const uit = regelsZonderKostengroep(
      [regel('r1', ''), regel('r2', undefined, { is_verwijderd: true })],
      [comp('c1', 'r1', 0), comp('c2', 'r1', 100, { is_verwijderd: true }), comp('c3', 'r2', 100)],
    )
    expect(uit).toEqual([])
  })

  it('telt een kostengroep met alleen een omschrijving-deel als leeg', () => {
    expect(regelsZonderKostengroep([regel('r1', ' — Naam')], [comp('c1', 'r1', 10)])).toHaveLength(1)
  })

  it('noemt de regels in de melding', () => {
    expect(meldingZonderKostengroep([{ componentId: 'c1', omschrijving: 'X', bedrag: 1 }])).toContain('"X"')
  })
})
