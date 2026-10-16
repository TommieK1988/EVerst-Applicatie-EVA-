import { describe, it, expect } from 'vitest'
import {
  begrensMegaHercontrole, magMegaEigenaarZijn, ontvangstcontroleDoor, standaardStilReden,
  vervaltAutomatisch, wordtNagebeld,
} from './opvolging'

describe('wordtNagebeld', () => {
  it('volgt de bedragklasse, tenzij de offerte zelf iets anders zegt', () => {
    expect(wordtNagebeld('klein', null)).toBe(false)
    expect(wordtNagebeld('middel', null)).toBe(true)
    expect(wordtNagebeld('klein', 'altijd')).toBe(true)
    expect(wordtNagebeld('mega', 'niet')).toBe(false)
  })
})

describe('begrensMegaHercontrole', () => {
  it('maakt van een besluit over drie maanden een hercontrole over twee weken', () => {
    expect(begrensMegaHercontrole('2027-01-20', '2026-10-16'))
      .toEqual({ stapDatum: '2026-10-30', besluitDatum: '2027-01-20' })
  })
  it('laat een datum binnen twee weken staan', () => {
    expect(begrensMegaHercontrole('2026-10-23', '2026-10-16'))
      .toEqual({ stapDatum: '2026-10-23', besluitDatum: null })
  })
})

describe('magMegaEigenaarZijn', () => {
  it('projectleider en directie wel, de rest niet', () => {
    expect(magMegaEigenaarZijn('Projectleider')).toBe(true)
    expect(magMegaEigenaarZijn('Directeur')).toBe(true)
    expect(magMegaEigenaarZijn('Directie')).toBe(true)
    expect(magMegaEigenaarZijn('Calculator')).toBe(false)
    expect(magMegaEigenaarZijn(null)).toBe(false)
  })
})

describe('ontvangstcontroleDoor', () => {
  const ids = { assistentId: 'marjolein', eigenaarId: 'pl' }
  it('klein niemand, mega de eigenaar, de rest de assistent', () => {
    expect(ontvangstcontroleDoor('klein', null, ids)).toBeNull()
    expect(ontvangstcontroleDoor('klein', 'altijd', ids)).toBe('marjolein')
    expect(ontvangstcontroleDoor('middel', null, ids)).toBe('marjolein')
    expect(ontvangstcontroleDoor('mega', null, ids)).toBe('pl')
    expect(ontvangstcontroleDoor('mega', null, { assistentId: 'marjolein', eigenaarId: null })).toBe('marjolein')
    expect(ontvangstcontroleDoor('groot', 'niet', ids)).toBeNull()
  })
})

describe('vervaltAutomatisch', () => {
  const basis = { klasse: 'klein' as const, opvolging: null, geldigTot: '2026-09-01', vandaag: '2026-10-16' }
  it('klein en ruim verlopen: ja', () => expect(vervaltAutomatisch(basis)).toBe(true))
  it('net verlopen: nog niet', () => expect(vervaltAutomatisch({ ...basis, geldigTot: '2026-10-01' })).toBe(false))
  it('altijd nabellen of niet klein: nooit', () => {
    expect(vervaltAutomatisch({ ...basis, opvolging: 'altijd' })).toBe(false)
    expect(vervaltAutomatisch({ ...basis, klasse: 'middel' })).toBe(false)
    expect(vervaltAutomatisch({ ...basis, geldigTot: null })).toBe(false)
  })
})

describe('standaardStilReden', () => {
  it('leidt de reden af uit de uitkomst', () => {
    expect(standaardStilReden('ligt_bij_alv')).toBe('besluit_alv')
    expect(standaardStilReden('verloren')).toBeNull()
    expect(standaardStilReden('geen_gehoor')).toBeUndefined()
  })
})
