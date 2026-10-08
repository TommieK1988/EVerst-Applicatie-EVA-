import { describe, expect, it } from 'vitest'
import { berekenPlanUren, blokOpDag, type PlanRooster, type PlanAfwezigheid } from './werkuren'
import { nlTijdstip } from './nl-tijd'

// Marc: 37,5 u op 07:30–16:15, ma–vr (het gangbare rooster). Pauze = 8,75 − 7,5 = 1,25 u.
const MARC: PlanRooster = {
  medewerker_id: 'marc', geldig_vanaf: '2026-01-01', geldig_tot: null,
  dagstart: '07:30:00', dageind: '16:15:00', werkdagen: [1, 2, 3, 4, 5], contracturen_per_week: 37.5,
}
// Een parttimer met 40 u op ma–do, 07:00–17:00.
const PIET: PlanRooster = {
  medewerker_id: 'piet', geldig_vanaf: '2026-01-01', geldig_tot: null,
  dagstart: '07:00:00', dageind: '17:00:00', werkdagen: [1, 2, 3, 4], contracturen_per_week: 40,
}
const ROOSTERS = [MARC, PIET]
const nl = (datum: string, tijd: string) => nlTijdstip(datum, tijd)
const uren = (med: string, s: string, e: string, afw: PlanAfwezigheid[] = []) =>
  berekenPlanUren(med, s, e, ROOSTERS, afw)

describe('berekenPlanUren', () => {
  it('één volle werkdag = contracturen per dag, niet dagstart–dageind', () => {
    expect(uren('marc', nl('2026-10-19', '07:30'), nl('2026-10-19', '16:15'))).toBe(7.5)
  })

  it('twee werkdagen van 07:30 tot 16:15 = twee keer de daguren (het venster-voorbeeld)', () => {
    expect(uren('marc', nl('2026-10-19', '07:30'), nl('2026-10-20', '16:15'))).toBe(15)
  })

  it('ma 14:00 → vr 16:15: middag + vier volle dagen, de tussendagen op het rooster', () => {
    // ma 14:00–16:15 = 2,25 (na de pauze), di t/m vr 4 × 7,5 = 30
    expect(uren('marc', nl('2026-10-19', '14:00'), nl('2026-10-23', '16:15'))).toBe(32.25)
  })

  it('Bouw7-dagblok 00:00 → 00:00 (exclusief eind) telt de werkdagen, niet een dag extra', () => {
    // ma 5 t/m wo 7 okt; eind = do 8 okt 00:00
    expect(uren('marc', nl('2026-10-05', '00:00'), nl('2026-10-08', '00:00'))).toBe(22.5)
  })

  it('start op middernacht en eind met kloktijd: de eerste dag begint op het rooster', () => {
    // ma 5 – do 8 okt 16:15 = 4 volle dagen
    expect(uren('marc', nl('2026-10-05', '00:00'), nl('2026-10-08', '16:15'))).toBe(30)
  })

  it('weekend in het midden telt niet mee', () => {
    // vr 23 → do 29 okt = vr + ma–do = 5 dagen
    expect(uren('marc', nl('2026-10-23', '07:30'), nl('2026-10-29', '16:15'))).toBe(37.5)
  })

  it('een ochtend telt tot aan de pauze', () => {
    expect(uren('marc', nl('2026-10-19', '07:30'), nl('2026-10-19', '12:00'))).toBe(4.5)
  })

  it('werk na de werkdag (eigen kloktijd buiten het rooster) telt gewoon mee', () => {
    // maandag 17:00–19:00
    expect(uren('marc', nl('2026-10-19', '17:00'), nl('2026-10-19', '19:00'))).toBe(2)
  })

  it('een blok helemaal in het weekend is 0 uur', () => {
    expect(uren('marc', nl('2026-10-24', '08:00'), nl('2026-10-24', '12:00'))).toBe(0)
  })

  it('een hele zaterdag als Bouw7-dagblok is 0 uur', () => {
    expect(uren('marc', nl('2026-10-17', '00:00'), nl('2026-10-18', '00:00'))).toBe(0)
  })

  it('rooster per medewerker: vrijdag is geen werkdag voor de parttimer', () => {
    // ma 19 → vr 23 okt: 4 dagen × 10 u
    expect(uren('piet', nl('2026-10-19', '07:00'), nl('2026-10-23', '17:00'))).toBe(40)
  })

  it('verlof binnen het blok telt niet mee', () => {
    const verlof = [{ medewerker_id: 'marc', start_datum: '2026-10-21', eind_datum: '2026-10-21' }]
    expect(uren('marc', nl('2026-10-19', '07:30'), nl('2026-10-23', '16:15'), verlof)).toBe(30)
  })

  it('zonder rooster: ma–vr, 8 uur per dag', () => {
    expect(uren('onbekend', nl('2026-10-19', '07:00'), nl('2026-10-20', '16:00'))).toBe(16)
  })

  it('over de zomertijdwissel heen (25 okt) blijven het gewone werkdagen', () => {
    expect(uren('marc', nl('2026-10-23', '00:00'), nl('2026-10-27', '00:00'))).toBe(15) // vr + ma
  })

  it('eind vóór start levert 0', () => {
    expect(uren('marc', nl('2026-10-20', '07:30'), nl('2026-10-19', '16:15'))).toBe(0)
  })
})

describe('blokOpDag', () => {
  const s = nl('2026-10-19', '14:00')
  const e = nl('2026-10-23', '16:15')
  const blok = (datum: string) => blokOpDag('marc', s, e, datum, ROOSTERS)

  it('eerste dag vanaf de eigen starttijd tot het einde van de werkdag', () => {
    expect(blok('2026-10-19')).toEqual({ van: 14 * 60, tot: 16 * 60 + 15 })
  })
  it('tussendag op het rooster', () => {
    expect(blok('2026-10-21')).toEqual({ van: 7 * 60 + 30, tot: 16 * 60 + 15 })
  })
  it('laatste dag vanaf de roosterstart tot de eigen eindtijd', () => {
    expect(blok('2026-10-23')).toEqual({ van: 7 * 60 + 30, tot: 16 * 60 + 15 })
  })
  it('buiten het blok: niets', () => {
    expect(blok('2026-10-24')).toBeNull()
  })
})
