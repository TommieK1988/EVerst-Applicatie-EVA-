import { describe, expect, it } from 'vitest'
import { dagenVanBlok, verbredingVoorBlokken } from './activiteit-bereik'

const act = { gewenste_start: '2026-11-09', deadline: '2026-11-10' }

describe('dagenVanBlok', () => {
  it('neemt de NL-kalenderdag, ook als het moment in UTC op de dag ervoor valt', () => {
    expect(dagenVanBlok({ start_dt: '2026-11-08T23:30:00Z', eind_dt: '2026-11-09T15:00:00Z' }))
      .toEqual({ van: '2026-11-09', tot: '2026-11-09' })
  })
  it('telt een eind om middernacht bij de dag ervóór', () => {
    expect(dagenVanBlok({ start_dt: '2026-11-09T00:00:00+01:00', eind_dt: '2026-11-11T00:00:00+01:00' }))
      .toEqual({ van: '2026-11-09', tot: '2026-11-10' })
  })
})

describe('verbredingVoorBlokken', () => {
  it('laat de activiteit staan als het planitem erbinnen valt', () => {
    expect(verbredingVoorBlokken(act, [{ start_dt: '2026-11-09T07:00:00+01:00', eind_dt: '2026-11-10T16:00:00+01:00' }])).toBeNull()
  })
  it('schuift de deadline op als het planitem later valt', () => {
    expect(verbredingVoorBlokken(act, [{ start_dt: '2026-11-23T07:00:00+01:00', eind_dt: '2026-11-24T16:00:00+01:00' }]))
      .toEqual({ deadline: '2026-11-24' })
  })
  it('vervroegt de start als het planitem eerder valt', () => {
    expect(verbredingVoorBlokken(act, [{ start_dt: '2026-11-02T07:00:00+01:00', eind_dt: '2026-11-02T16:00:00+01:00' }]))
      .toEqual({ gewenste_start: '2026-11-02' })
  })
  it('vult ontbrekende datums in', () => {
    expect(verbredingVoorBlokken({ gewenste_start: null, deadline: null }, [{ start_dt: '2026-11-09T07:00:00+01:00', eind_dt: '2026-11-09T16:00:00+01:00' }]))
      .toEqual({ gewenste_start: '2026-11-09', deadline: '2026-11-09' })
  })
  it('omspant meerdere blokken tegelijk', () => {
    expect(verbredingVoorBlokken(act, [
      { start_dt: '2026-11-05T07:00:00+01:00', eind_dt: '2026-11-05T16:00:00+01:00' },
      { start_dt: '2026-11-12T07:00:00+01:00', eind_dt: '2026-11-12T16:00:00+01:00' },
    ])).toEqual({ gewenste_start: '2026-11-05', deadline: '2026-11-12' })
  })
})
