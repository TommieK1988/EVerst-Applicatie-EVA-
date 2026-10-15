import { describe, expect, it } from 'vitest'
import { begroteArbeidPerCode, splitsKostengroep } from './uren-bewaking-wb-bereken'

describe('begroteArbeidPerCode', () => {
  it('vermenigvuldigt de norm met de hoeveelheid van de regel', () => {
    const perCode = begroteArbeidPerCode(
      [{ id: 'r1', kostengroep: 'BU.A — Buitenschilderwerk', hoeveelheid: 40 }],
      [{ werkbegroting_regel_id: 'r1', norm_hoeveelheid: 0.5, tarief: 55 }],
    )
    expect(perCode.get('BU.A')).toEqual({ uren: 20, bedrag: 1100 })
  })

  it('telt meerdere regels en componenten per code op, ook als strings', () => {
    const perCode = begroteArbeidPerCode(
      [
        { id: 'r1', kostengroep: 'AW01 — Aangenomen werk', hoeveelheid: '10' },
        { id: 'r2', kostengroep: 'AW01', hoeveelheid: 4 },
        { id: 'r3', kostengroep: 'HR.A', hoeveelheid: 2 },
      ],
      [
        { werkbegroting_regel_id: 'r1', norm_hoeveelheid: '1.5', tarief: '50' },
        { werkbegroting_regel_id: 'r1', norm_hoeveelheid: 0.5, tarief: 60 },
        { werkbegroting_regel_id: 'r2', norm_hoeveelheid: 2, tarief: 50 },
        { werkbegroting_regel_id: 'r3', norm_hoeveelheid: 3, tarief: 45 },
      ],
    )
    // AW01: 10×1,5 = 15 u à 50 + 10×0,5 = 5 u à 60 + 4×2 = 8 u à 50
    expect(perCode.get('AW01')).toEqual({ uren: 28, bedrag: 750 + 300 + 400 })
    expect(perCode.get('HR.A')).toEqual({ uren: 6, bedrag: 270 })
  })

  it('weegt het gemiddelde uurtarief naar uren, niet naar norm', () => {
    const perCode = begroteArbeidPerCode(
      [
        { id: 'groot', kostengroep: 'BK.A', hoeveelheid: 100 },
        { id: 'klein', kostengroep: 'BK.A', hoeveelheid: 1 },
      ],
      [
        { werkbegroting_regel_id: 'groot', norm_hoeveelheid: 1, tarief: 50 },
        { werkbegroting_regel_id: 'klein', norm_hoeveelheid: 1, tarief: 80 },
      ],
    )
    const r = perCode.get('BK.A')!
    expect(r.bedrag / r.uren).toBeCloseTo(5080 / 101)
  })

  it('slaat correctiecodes, lege codes en componenten zonder regel over', () => {
    const perCode = begroteArbeidPerCode(
      [
        { id: 'r1', kostengroep: '', hoeveelheid: 5 },
        { id: 'r2', kostengroep: null, hoeveelheid: 5 },
        { id: 'r3', kostengroep: '410.A', hoeveelheid: null },
      ],
      [
        { werkbegroting_regel_id: 'r1', norm_hoeveelheid: 1, tarief: 50 },
        { werkbegroting_regel_id: 'r2', norm_hoeveelheid: 1, tarief: 50 },
        { werkbegroting_regel_id: 'r3', norm_hoeveelheid: 1, tarief: 50 },
        { werkbegroting_regel_id: 'onbekend', norm_hoeveelheid: 1, tarief: 50 },
      ],
    )
    expect([...perCode.keys()]).toEqual(['410.A'])
    expect(perCode.get('410.A')).toEqual({ uren: 0, bedrag: 0 })
  })
})

describe('splitsKostengroep', () => {
  it('splitst op het eerste scheidingsteken en laat de rest staan', () => {
    expect(splitsKostengroep('03.A — Splash - Zaagmolenstraat 98F')).toEqual({ code: '03.A', naam: 'Splash - Zaagmolenstraat 98F' })
    expect(splitsKostengroep(' 10.10.11.A ')).toEqual({ code: '10.10.11.A', naam: null })
  })
})
