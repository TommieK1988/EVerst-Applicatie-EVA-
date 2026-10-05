import { describe, expect, it } from 'vitest'
import type { Medewerker, MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { afwezigenPerDag } from './afwezigheid-teller'

const med = (id: string, voornaam: string, afdeling: string) =>
  ({ id, voornaam, tussenvoegsel: null, achternaam: 'Test', afdeling }) as Medewerker

const afw = (medewerker_id: string, start_datum: string, eind_datum: string, extra: Partial<MedewerkerAfwezigheid> = {}) =>
  ({ id: `${medewerker_id}-${start_datum}`, medewerker_id, type: 'verlof', start_datum, eind_datum,
     start_tijd: null, eind_tijd: null, ...extra }) as MedewerkerAfwezigheid

describe('afwezigenPerDag', () => {
  const anna = med('a', 'Anna', 'Projectbureau')
  const bram = med('b', 'Bram', 'Directie')

  it('telt overlap per werkdag en slaat het weekend over', () => {
    // vr 2 okt t/m di 6 okt 2026 voor Anna, ma 5 okt voor Bram.
    const perDag = afwezigenPerDag([anna, bram], {
      a: [afw('a', '2026-10-02', '2026-10-06')],
      b: [afw('b', '2026-10-05', '2026-10-05')],
    }, new Set())
    expect(perDag.get('2026-10-02')?.length).toBe(1)
    expect(perDag.has('2026-10-03')).toBe(false) // zaterdag
    expect(perDag.has('2026-10-04')).toBe(false) // zondag
    expect(perDag.get('2026-10-05')?.map(a => a.naam)).toEqual(['Anna Test', 'Bram Test'])
    expect(perDag.get('2026-10-06')?.length).toBe(1)
  })

  it('negeert feestdagen en telt iemand met twee dagdelen één keer', () => {
    const perDag = afwezigenPerDag([anna], {
      a: [
        afw('a', '2026-10-07', '2026-10-07', { start_tijd: '08:00:00', eind_tijd: '12:00:00' }),
        afw('a', '2026-10-07', '2026-10-08', { id: 'x' }),
      ],
    }, new Set(['2026-10-08']))
    expect(perDag.get('2026-10-07')).toEqual([{ naam: 'Anna Test', afdeling: 'Projectbureau', label: 'verlof 08:00–12:00' }])
    expect(perDag.has('2026-10-08')).toBe(false)
  })

  it('telt alleen de meegegeven medewerkers', () => {
    const perDag = afwezigenPerDag([anna], { b: [afw('b', '2026-10-05', '2026-10-05')] }, new Set())
    expect(perDag.size).toBe(0)
  })
})
