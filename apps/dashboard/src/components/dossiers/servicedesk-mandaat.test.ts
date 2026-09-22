import { describe, expect, it } from 'vitest'
import {
  MANDAAT_WAARSCHUWING_PCT,
  mandaatRuimte,
  mandaatStand,
  mandaatVulling,
} from './servicedesk-mandaat'

describe('mandaatStand', () => {
  it('meldt niets zonder mandaat', () => {
    expect(mandaatStand({ mandaat: null, totaal: 5000 })).toBe('geen')
  })

  it('behandelt een mandaat van nul als niet ingevuld', () => {
    // Anders staat elke bon met een leeg veld meteen op rood en kijkt niemand meer naar de kleur.
    expect(mandaatStand({ mandaat: 0, totaal: 1 })).toBe('geen')
    expect(mandaatStand({ mandaat: 0, totaal: 0 })).toBe('geen')
  })

  it('is binnen tot aan de waarschuwingsgrens', () => {
    expect(mandaatStand({ mandaat: 1000, totaal: 0 })).toBe('binnen')
    expect(mandaatStand({ mandaat: 1000, totaal: 799.99 })).toBe('binnen')
  })

  it('waarschuwt vanaf de grens, inclusief de grens zelf', () => {
    expect(MANDAAT_WAARSCHUWING_PCT).toBe(80)
    expect(mandaatStand({ mandaat: 1000, totaal: 800 })).toBe('bijna')
    expect(mandaatStand({ mandaat: 1000, totaal: 999.99 })).toBe('bijna')
  })

  it('telt precies op het mandaat nog niet als overschrijding', () => {
    // Het mandaat is het maximum dat je mág besteden, niet het bedrag waar je onder moet blijven.
    expect(mandaatStand({ mandaat: 1000, totaal: 1000 })).toBe('bijna')
    expect(mandaatStand({ mandaat: 1000, totaal: 1000.01 })).toBe('over')
  })

  it('volgt een afwijkende waarschuwingsgrens', () => {
    expect(mandaatStand({ mandaat: 1000, totaal: 850, waarschuwingPct: 90 })).toBe('binnen')
    expect(mandaatStand({ mandaat: 1000, totaal: 900, waarschuwingPct: 90 })).toBe('bijna')
  })
})

describe('mandaatVulling', () => {
  it('rekent het percentage van het mandaat', () => {
    expect(mandaatVulling({ mandaat: 1000, totaal: 250 })).toBe(25)
  })

  it('kapt af op honderd, zodat de balk niet buiten zijn bak loopt', () => {
    expect(mandaatVulling({ mandaat: 1000, totaal: 4000 })).toBe(100)
  })

  it('gaat niet onder nul bij een negatief totaal', () => {
    expect(mandaatVulling({ mandaat: 1000, totaal: -50 })).toBe(0)
  })

  it('is leeg zonder mandaat', () => {
    expect(mandaatVulling({ mandaat: null, totaal: 500 })).toBe(0)
  })
})

describe('mandaatRuimte', () => {
  it('geeft terug wat er nog binnen past', () => {
    expect(mandaatRuimte({ mandaat: 1000, totaal: 250 })).toBe(750)
  })

  it('wordt negatief bij overschrijding', () => {
    expect(mandaatRuimte({ mandaat: 1000, totaal: 1250 })).toBe(-250)
  })

  it('rondt op centen af in plaats van een kommagetal te tonen', () => {
    expect(mandaatRuimte({ mandaat: 1000, totaal: 333.333 })).toBe(666.67)
  })

  it('bestaat niet zonder mandaat', () => {
    expect(mandaatRuimte({ mandaat: null, totaal: 0 })).toBeNull()
  })
})
