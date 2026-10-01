import { describe, expect, it } from 'vitest'
import {
  LEEG_WERKPLAN, WERKOMSCHRIJVING_SJABLOON, heeftInhoud, overigeBetrokkenen, werkafsprakenAlsZinnen, werkplanSchema,
  type WerkplanInvoer,
} from './werkplan-types'

const geldig: WerkplanInvoer = {
  ...LEEG_WERKPLAN,
  werkomschrijving: `${WERKOMSCHRIJVING_SJABLOON}\nKozijnen schilderen aan de voorzijde.`,
}

describe('werkplanSchema', () => {
  it('keurt een werkomschrijving met alleen de kopjes af', () => {
    expect(heeftInhoud(WERKOMSCHRIJVING_SJABLOON)).toBe(false)
    const r = werkplanSchema.safeParse(LEEG_WERKPLAN)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['werkomschrijving'])
  })

  it('accepteert een ingevuld werkplan', () => {
    expect(werkplanSchema.safeParse(geldig).success).toBe(true)
  })

  it('eist een bedrag bij parkeerkosten declareren', () => {
    const r = werkplanSchema.safeParse({ ...geldig, parkeren_keuze: 'declareren' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['parkeren_max_per_dag'])
    expect(werkplanSchema.safeParse({ ...geldig, parkeren_keuze: 'declareren', parkeren_max_per_dag: 7.5 }).success).toBe(true)
  })

  it('eist een geldige vertrektijd bij reisuren binnen de productieve uren', () => {
    expect(werkplanSchema.safeParse({ ...geldig, reisuren_keuze: 'binnen_productief' }).success).toBe(false)
    expect(werkplanSchema.safeParse({ ...geldig, reisuren_keuze: 'binnen_productief', reisuren_vertrektijd: '25:00' }).success).toBe(false)
    expect(werkplanSchema.safeParse({ ...geldig, reisuren_keuze: 'binnen_productief', reisuren_vertrektijd: '15:30' }).success).toBe(true)
  })

  it('laat lege tabelrijen weg', () => {
    const r = werkplanSchema.parse({
      ...geldig,
      kleuren_materialen: [{ onderdeel: 'Kozijnen', waarde: 'RAL 9010' }, { onderdeel: ' ', waarde: '' }],
    })
    expect(r.kleuren_materialen).toEqual([{ onderdeel: 'Kozijnen', waarde: 'RAL 9010' }])
  })
})

describe('werkafsprakenAlsZinnen', () => {
  it('vult de ingevulde waarde in de gekozen zin', () => {
    const w = werkplanSchema.parse({ ...geldig, reiskosten_keuze: 'vergoeding', reiskosten_km: 42 })
    const reiskosten = werkafsprakenAlsZinnen(w).find(z => z.titel === 'Reiskosten')
    expect(reiskosten?.zin).toContain('De rijafstand is 42 km')
  })
})

describe('overigeBetrokkenen', () => {
  it('laat de contactpersoon van de opdrachtgever weg', () => {
    const lijst = [
      { herkomst: 'opdrachtgever', naam: 'A' },
      { herkomst: 'factuuradres', naam: 'B' },
      { herkomst: 'handmatig', naam: 'C' },
    ]
    expect(overigeBetrokkenen(lijst).map(b => b.naam)).toEqual(['B', 'C'])
  })
})
