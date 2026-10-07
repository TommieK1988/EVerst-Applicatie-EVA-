import { describe, expect, it } from 'vitest'
import { berekenWeekTotalen, verdeelOveruren } from './rekenregel'

// Week 41 van 2026: ma 5 t/m zo 11 oktober, rooster ma-vr 7,5 uur.
const NORM: Record<string, number> = {
  '2026-10-05': 7.5, '2026-10-06': 7.5, '2026-10-07': 7.5, '2026-10-08': 7.5, '2026-10-09': 7.5,
}
const dag = (datum: string, uren: number) => ({ datum, uren })

describe('verdeelOveruren', () => {
  it('zet 45 uur op 37,5 als -7,5 op de dagen met overuren, van achter naar voren', () => {
    const regels = [
      dag('2026-10-05', 9), dag('2026-10-06', 9), dag('2026-10-07', 9),
      dag('2026-10-08', 9), dag('2026-10-09', 9),
    ]
    expect(verdeelOveruren(regels, NORM, 37.5)).toEqual([
      dag('2026-10-05', -1.5), dag('2026-10-06', -1.5), dag('2026-10-07', -1.5),
      dag('2026-10-08', -1.5), dag('2026-10-09', -1.5),
    ])
  })

  it('maakt niets aan als de week precies vol is, ook al wijkt een dag af', () => {
    const regels = [
      dag('2026-10-05', 9.5), dag('2026-10-06', 5.5), dag('2026-10-07', 7.5),
      dag('2026-10-08', 7.5), dag('2026-10-09', 7.5),
    ]
    expect(verdeelOveruren(regels, NORM, 37.5)).toEqual([])
  })

  it('maakt niets aan bij te weinig uren', () => {
    expect(verdeelOveruren([dag('2026-10-05', 30)], NORM, 37.5)).toEqual([])
  })

  it('telt zaterdag helemaal als meer', () => {
    const regels = [
      ...Object.keys(NORM).map(d => dag(d, 7.5)),
      dag('2026-10-10', 4),
    ]
    expect(verdeelOveruren(regels, NORM, 37.5)).toEqual([dag('2026-10-10', -4)])
  })

  it('neemt alleen het weekoverschot, ook als een dag meer extra heeft', () => {
    // Ma 10 (+2,5), di 5 (-2,5), wo-vr 7,5, za 3: per week 3 uur meer.
    const regels = [
      dag('2026-10-05', 10), dag('2026-10-06', 5), dag('2026-10-07', 7.5),
      dag('2026-10-08', 7.5), dag('2026-10-09', 7.5), dag('2026-10-10', 3),
    ]
    expect(verdeelOveruren(regels, NORM, 37.5)).toEqual([dag('2026-10-10', -3)])
  })

  it('verdeelt over meerdere dagen als de laatste niet genoeg heeft', () => {
    const regels = [
      dag('2026-10-05', 7.5), dag('2026-10-06', 7.5), dag('2026-10-07', 10),
      dag('2026-10-08', 7.5), dag('2026-10-09', 8.5),
    ]
    expect(verdeelOveruren(regels, NORM, 37.5)).toEqual([
      dag('2026-10-07', -2.5), dag('2026-10-09', -1),
    ])
  })

  it('zet een rest die niet bij een dag past op de laatste dag met uren', () => {
    // Bevroren weeknorm 36, rooster zegt 37,5: 1,5 uur meer zonder dag die het verklaart.
    const regels = Object.keys(NORM).map(d => dag(d, 7.5))
    expect(verdeelOveruren(regels, NORM, 36)).toEqual([dag('2026-10-09', -1.5)])
  })

  it('maakt niets aan zonder norm (extern)', () => {
    expect(verdeelOveruren([dag('2026-10-05', 50)], {}, 0)).toEqual([])
  })

  it('houdt het saldo gelijk aan de oude rekenregel en maakt de week vierkant', () => {
    const werk = Object.keys(NORM).map(d => ({ ...dag(d, 9), categorie: 'werk' as const }))
    const auto = verdeelOveruren(werk, NORM, 37.5)
      .map(r => ({ ...r, categorie: 'tijd_voor_tijd' as const }))
    const zonder = berekenWeekTotalen(werk, 37.5)
    const met = berekenWeekTotalen([...werk, ...auto], 37.5)
    expect(met.totaalUren).toBe(37.5)
    expect(met.saldoMutatie).toBe(zonder.saldoMutatie)
    expect(met.saldoMutatie).toBe(7.5)
  })

  it('werkt met handmatige tijd voor tijd in dezelfde week', () => {
    // Ma 7,5 tvt (vrij genomen), di-vr 9 werk + za 6: 49,5 totaal, 12 meer.
    const regels = [
      dag('2026-10-05', 7.5), dag('2026-10-06', 9), dag('2026-10-07', 9),
      dag('2026-10-08', 9), dag('2026-10-09', 9), dag('2026-10-10', 6),
    ]
    const uit = verdeelOveruren(regels, NORM, 37.5)
    expect(uit.reduce((s, r) => s + r.uren, 0)).toBe(-12)
    expect(uit).toEqual([
      dag('2026-10-07', -1.5), dag('2026-10-08', -1.5), dag('2026-10-09', -1.5), dag('2026-10-10', -6),
      dag('2026-10-06', -1.5),
    ].sort((a, b) => a.datum.localeCompare(b.datum)))
  })
})
