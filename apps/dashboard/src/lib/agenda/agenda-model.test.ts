import { describe, expect, it } from 'vitest'
import { dagVanTijdstip, tijdVanTijdstip } from './agenda-model'

// PostgREST levert timestamptz in UTC; de server (Vercel) draait ook in UTC. Wat de
// medewerker moet zien is de Nederlandse kloktijd, zomer én winter.
describe('NL-tijd van een planitem', () => {
  it('zomertijd: 05:00 UTC is 07:00 in Nederland', () => {
    expect(tijdVanTijdstip('2026-09-15T05:00:00+00:00')).toBe('07:00')
    expect(dagVanTijdstip('2026-09-15T05:00:00+00:00')).toBe('2026-09-15')
  })

  it('wintertijd: 06:00 UTC is 07:00 in Nederland', () => {
    expect(tijdVanTijdstip('2026-11-10T06:00:00+00:00')).toBe('07:00')
  })

  it('dagblok van middernacht valt op de NL-dag, niet de UTC-dag ervoor', () => {
    expect(dagVanTijdstip('2026-05-31T22:00:00+00:00')).toBe('2026-06-01')
    expect(tijdVanTijdstip('2026-05-31T22:00:00+00:00')).toBe('00:00')
    expect(dagVanTijdstip('2026-12-31T23:00:00+00:00')).toBe('2027-01-01')
  })

  it('exclusief einde op middernacht telt als de dag ervoor', () => {
    expect(dagVanTijdstip('2026-06-02T22:00:00+00:00', true)).toBe('2026-06-02')
  })

  it('rond de omschakeling (25 oktober 2026)', () => {
    expect(tijdVanTijdstip('2026-10-24T05:00:00+00:00')).toBe('07:00')
    expect(tijdVanTijdstip('2026-10-26T06:00:00+00:00')).toBe('07:00')
  })

  it('leeg of ongeldig levert null', () => {
    expect(tijdVanTijdstip(null)).toBeNull()
    expect(dagVanTijdstip('geen datum')).toBeNull()
  })
})
