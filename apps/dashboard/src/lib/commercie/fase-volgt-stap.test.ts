import { describe, it, expect } from 'vitest'
import { faseNaStap } from './fase-volgt-stap'

describe('faseNaStap', () => {
  it('geen gehoor op een wachtende offerte zet hem op actie (de oude tegenspraak)', () => {
    expect(faseNaStap('in_behandeling', null, 'actie')).toBe('nabellen')
  })

  it('wachten op de klant zet hem op in_behandeling', () => {
    expect(faseNaStap('nabellen', 'in_behandeling', 'wachten')).toBe('in_behandeling')
  })

  it('de eerste stap na verzenden haalt hem uit Verzonden', () => {
    expect(faseNaStap('verzonden', null, 'actie')).toBe('nabellen')
  })

  it('een aangepaste offerte is een actie voor ons, ook al vroeg de uitkomst om in_behandeling', () => {
    expect(faseNaStap('in_behandeling', 'in_behandeling', 'actie')).toBe('nabellen')
  })

  it('verandert niets als de fase al klopt', () => {
    expect(faseNaStap('nabellen', null, 'actie')).toBeNull()
  })

  it('mondeling akkoord en eindfases van de uitkomst winnen', () => {
    expect(faseNaStap('nabellen', 'mondelinge_toezegging', 'actie')).toBe('mondelinge_toezegging')
    expect(faseNaStap('in_behandeling', 'verloren', null)).toBe('verloren')
  })

  it('mondeling akkoord zakt niet terug door een vervolgstap', () => {
    expect(faseNaStap('mondelinge_toezegging', null, 'actie')).toBeNull()
    expect(faseNaStap('mondelinge_toezegging', 'in_behandeling', 'wachten')).toBeNull()
  })

  it('zonder stap blijft de fase staan', () => {
    expect(faseNaStap('nabellen', null, null)).toBeNull()
  })
})
