import { describe, it, expect } from 'vitest'
import { berekenWijzigingen, type WerkCijfers } from './wijzigingen'

function werk(nr: string, velden: Partial<WerkCijfers> = {}): WerkCijfers {
  return {
    projectnummer: nr, bouw7_id: `b${nr}`, filiaal: null, status: '04. In uitvoering',
    opdrachtgever: null, projectnaam: nr, projectleider: null,
    totale_opdracht: 50_000, verwacht_resultaat: 15_000, pct_marge: 30, pct_gereed: 40,
    dossier_id: null, dossier_sectie: null,
    ...velden,
  }
}

describe('berekenWijzigingen', () => {
  it('deelt margebewegers in op richting en sorteert op grootste verschuiving', () => {
    const vorig = [werk('A'), werk('B'), werk('C')]
    const huidig = [
      werk('A', { pct_marge: 20, verwacht_resultaat: 10_000 }),
      werk('B', { pct_marge: 27, verwacht_resultaat: 13_500 }),
      werk('C', { pct_marge: 36, verwacht_resultaat: 18_000 }),
    ]
    const r = berekenWijzigingen(huidig, vorig)
    expect(r.gedaald.map(w => w.werk.projectnummer)).toEqual(['A', 'B'])
    expect(r.gedaald[0].deltaMarge).toBe(-10)
    expect(r.gestegen.map(w => w.werk.projectnummer)).toEqual(['C'])
    expect(r.opdrachtGewijzigd).toEqual([])
  })

  it('negeert kleine verschuivingen', () => {
    const r = berekenWijzigingen([werk('A', { pct_marge: 31, verwacht_resultaat: 15_500 })], [werk('A')])
    expect(r.gedaald.length + r.gestegen.length + r.opdrachtGewijzigd.length).toBe(0)
  })

  it('laat kleine werken weg, hoe hard de marge ook slingert', () => {
    const vorig = [werk('K', { totale_opdracht: 1_195, pct_marge: 100 })]
    const huidig = [werk('K', { totale_opdracht: 1_195, pct_marge: 20 })]
    expect(berekenWijzigingen(huidig, vorig).gedaald).toEqual([])
  })

  it('zet meerwerk tegen gelijke marge apart, ook als het resultaat daardoor stijgt', () => {
    const vorig = [werk('M', { totale_opdracht: 511_595, verwacht_resultaat: 255_927, pct_marge: 50.03 })]
    const huidig = [werk('M', { totale_opdracht: 559_674, verwacht_resultaat: 280_289, pct_marge: 50.08 })]
    const r = berekenWijzigingen(huidig, vorig)
    expect(r.gestegen).toEqual([])
    expect(r.opdrachtGewijzigd.map(w => w.werk.projectnummer)).toEqual(['M'])
    expect(r.opdrachtGewijzigd[0].deltaOpdracht).toBeCloseTo(48_079)
  })

  it('telt een resultaatdaling zonder opdrachtwijziging als margebeweger', () => {
    // Marge −1,5 pp maar op een groot werk: €6.000 minder resultaat.
    const vorig = [werk('G', { totale_opdracht: 400_000, verwacht_resultaat: 120_000, pct_marge: 30 })]
    const huidig = [werk('G', { totale_opdracht: 400_000, verwacht_resultaat: 114_000, pct_marge: 28.5 })]
    expect(berekenWijzigingen(huidig, vorig).gedaald.map(w => w.werk.projectnummer)).toEqual(['G'])
  })

  it('slaat nieuwe werken, werken zonder marge en offerte-statussen over', () => {
    const vorig = [werk('Z', { pct_marge: null }), werk('O')]
    const huidig = [
      werk('N', { pct_marge: 5 }),
      werk('Z', { pct_marge: 10 }),
      werk('O', { status: '01. Offerte', pct_marge: 5 }),
    ]
    const r = berekenWijzigingen(huidig, vorig)
    expect(r.gedaald.length + r.gestegen.length).toBe(0)
  })

  it('valt terug op projectnummer als bouw7_id ontbreekt', () => {
    const r = berekenWijzigingen(
      [werk('P', { bouw7_id: null, pct_marge: 10, verwacht_resultaat: 5_000 })],
      [werk('P', { bouw7_id: null })],
    )
    expect(r.gedaald.map(w => w.werk.projectnummer)).toEqual(['P'])
  })
})
