import { describe, it, expect } from 'vitest'
import { controleerCalculatie, telControle, wisselBevestiging } from './controle'
import type { Calculatieregel, Componentregel, Groep } from './types'

const groep: Groep = { id: 'g1', scenario_id: 's', parent_id: null, naam: 'Gevel achter', niveau: 1, volgorde: 0 }
const regel = (id: string, extra: Partial<Calculatieregel> = {}): Calculatieregel =>
  ({ id, groep_id: 'g1', omschrijving: `Regel ${id}`, hoeveelheid: 10, eenheid: 'm2', volgorde: 0, ...extra })
const comp = (regelId: string, extra: Partial<Componentregel>): Componentregel =>
  ({ id: `c-${regelId}-${extra.type}`, calculatieregel_id: regelId, type: 'arbeid', norm_hoeveelheid: 0.5, tarief: 58, ...extra })

const basis = { groepen: [groep], kostprijs: 800, verkoopprijs: 1000, voorwaardenGekozen: true }

describe('controleerCalculatie', () => {
  it('geeft niets bij een nette calculatie', () => {
    const punten = controleerCalculatie({ ...basis, regels: [regel('a')], componenten: [comp('a', {})] })
    expect(punten).toEqual([])
  })

  it('blokkeert uren zonder tarief, en meldt die regel niet nog eens als regel zonder prijs', () => {
    const punten = controleerCalculatie({ ...basis, regels: [regel('a')], componenten: [comp('a', { tarief: 0 })] })
    expect(punten.map(p => p.soort)).toEqual(['arbeid_zonder_tarief'])
    expect(punten[0].niveau).toBe('blokkeert')
    expect(punten[0].detail).toBe('Gevel achter')
  })

  it('blokkeert ontbrekende voorwaarden, behalve bij een interne begroting', () => {
    const r = { ...basis, voorwaardenGekozen: false, regels: [regel('a')], componenten: [comp('a', {})] }
    expect(telControle(controleerCalculatie(r)).rood).toBe(1)
    expect(telControle(controleerCalculatie({ ...r, zonderVoorwaarden: true })).rood).toBe(0)
  })

  it('meldt marge onder 12% als nakijkpunt dat niet weg te klikken is', () => {
    const punten = controleerCalculatie({ ...basis, kostprijs: 950, regels: [regel('a')], componenten: [comp('a', {})] })
    const marge = punten.find(p => p.soort === 'marge_laag')!
    expect(marge.niveau).toBe('nakijken')
    expect(marge.bevestigbaar).toBe(false)
    expect(marge.titel).toBe('Marge 5,0%, onder 12%')
  })

  it('geen margemelding zonder verkoopprijs (lege calculatie)', () => {
    expect(controleerCalculatie({ ...basis, kostprijs: 0, verkoopprijs: 0, regels: [], componenten: [] })).toEqual([])
  })

  it('stelposten tellen tot ze met Klopt bevestigd zijn', () => {
    const invoer = { ...basis, regels: [regel('a', { is_stelpost: true })], componenten: [] }
    expect(telControle(controleerCalculatie(invoer))).toEqual({ rood: 0, oranje: 1 })
    const na = controleerCalculatie({ ...invoer, bevestigd: ['stelpost:a'] })
    expect(na[0].bevestigd).toBe(true)
    expect(telControle(na)).toEqual({ rood: 0, oranje: 0 })
  })

  it('meetstaatregel zonder behandeling', () => {
    const met = regel('b', { bestekcode: 'S-01', schilderbehandeling_id: 'beh1' })
    const zonder = regel('a', { bestekcode: 'S-01' })
    const punten = controleerCalculatie({ ...basis, regels: [met, zonder], componenten: [comp('a', {}), comp('b', {})] })
    expect(punten.map(p => p.sleutel)).toEqual(['meetstaat_zonder_behandeling:a'])
  })

  it('regel met hoeveelheid maar zonder enige prijs', () => {
    const punten = controleerCalculatie({ ...basis, regels: [regel('a')], componenten: [] })
    expect(punten.map(p => p.soort)).toEqual(['regel_zonder_prijs'])
  })

  it('gemarkeerde regel als nakijkpunt met de opmerking erbij, niet weg te klikken', () => {
    const punten = controleerCalculatie({
      ...basis,
      regels: [regel('a', { gemarkeerd: true, opmerking: 'Maat nog checken\nbij de VvE' }), regel('b', { opmerking: 'alleen notitie' })],
      componenten: [comp('a', {}), comp('b', {})],
    })
    expect(punten.map(p => p.sleutel)).toEqual(['gemarkeerd:a'])
    expect(punten[0].detail).toBe('Gevel achter · Maat nog checken')
    expect(punten[0].bevestigbaar).toBe(false)
    expect(telControle(punten)).toEqual({ rood: 0, oranje: 1 })
  })

  it('eigen uurtarief: nakijkpunt met het tarief erbij, weg te klikken met Klopt', () => {
    const invoer = {
      ...basis, calculatietarief: 58,
      regels: [regel('a'), regel('b')],
      componenten: [comp('a', { tarief: 52 }), comp('b', { tarief: 58 })],
    }
    const punten = controleerCalculatie(invoer)
    expect(punten.map(p => p.sleutel)).toEqual(['eigen_uurtarief:a'])
    expect(punten[0].detail).toContain('52,00')
    expect(punten[0].bevestigbaar).toBe(true)
    expect(telControle(controleerCalculatie({ ...invoer, bevestigd: ['eigen_uurtarief:a'] })).oranje).toBe(0)
  })

  it('zonder calculatietarief geen melding eigen tarief', () => {
    const punten = controleerCalculatie({ ...basis, regels: [regel('a')], componenten: [comp('a', { tarief: 52 })] })
    expect(punten).toEqual([])
  })

  it('slaat tekstregels over', () => {
    const punten = controleerCalculatie({ ...basis, regels: [regel('t', { soort: 'tekst', is_stelpost: true })], componenten: [] })
    expect(punten).toEqual([])
  })
})

describe('wisselBevestiging', () => {
  it('zet aan en weer uit', () => {
    const aan = wisselBevestiging(undefined, 'stelpost:a')
    expect(aan).toEqual(['stelpost:a'])
    expect(wisselBevestiging(aan, 'stelpost:a')).toEqual([])
  })
})
