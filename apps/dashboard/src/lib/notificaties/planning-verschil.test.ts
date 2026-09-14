import { describe, it, expect } from 'vitest'
import {
  afdruk, planningSleutel, planningVerschil, sorteerPlanning, type PlanRegel,
} from './planning-verschil'

/**
 * De planning-melding is de enige van de vier dagsignalen die op een vergelijking
 * berust, en daarmee de enige die stil de verkeerde kant op kan gaan: te vaak melden
 * (behang) of nooit melden (nutteloos). Deze tests leggen beide grenzen vast.
 */

const r = (dag: string, wat: string): PlanRegel => ({ dag, wat })

describe('sorteerPlanning + planningSleutel', () => {
  it('geeft dezelfde sleutel bij dezelfde planning in een andere volgorde', () => {
    // Dit is de valkuil die de melding onbruikbaar zou maken: de Bouw7-sync herbouwt
    // de rijen en levert ze in willekeurige volgorde terug. Zonder stabiele sortering
    // ziet elke nacht eruit als een wijziging.
    const a = sorteerPlanning([r('2026-09-15', 'Kozijnen'), r('2026-09-14', 'Schilderwerk')])
    const b = sorteerPlanning([r('2026-09-14', 'Schilderwerk'), r('2026-09-15', 'Kozijnen')])
    expect(planningSleutel('2026-09-14', a)).toBe(planningSleutel('2026-09-14', b))
  })

  it('geeft een andere sleutel als er iets bij komt', () => {
    const a = sorteerPlanning([r('2026-09-14', 'Schilderwerk')])
    const b = sorteerPlanning([r('2026-09-14', 'Schilderwerk'), r('2026-09-15', 'Kozijnen')])
    expect(planningSleutel('2026-09-14', a)).not.toBe(planningSleutel('2026-09-14', b))
  })

  it('geeft een andere sleutel als de horizon opschuift', () => {
    const zelfde = sorteerPlanning([r('2026-09-15', 'Kozijnen')])
    expect(planningSleutel('2026-09-14', zelfde)).not.toBe(planningSleutel('2026-09-15', zelfde))
  })

  it('botst niet op de voor de hand liggende verwisseling', () => {
    expect(afdruk('2026-09-14~Kozijnen')).not.toBe(afdruk('2026-09-14~Kozijner'))
    expect(afdruk('a|b')).not.toBe(afdruk('b|a'))
  })
})

describe('planningVerschil', () => {
  it('zwijgt als er niets veranderd is', () => {
    const zelfde = [r('2026-09-14', 'Schilderwerk'), r('2026-09-15', 'Kozijnen')]
    expect(planningVerschil(zelfde, zelfde)).toEqual([])
  })

  it('noemt een dag die er bij komt met wat er staat', () => {
    const uit = planningVerschil([], [r('2026-09-16', 'Kozijnen · 2026-114')])
    expect(uit).toHaveLength(1)
    expect(uit[0]).toContain('Kozijnen · 2026-114')
  })

  it('noemt alleen het nieuwe blok op een dag waar al werk stond', () => {
    const uit = planningVerschil(
      [r('2026-09-16', 'Schilderwerk')],
      [r('2026-09-16', 'Schilderwerk'), r('2026-09-16', 'Kozijnen')],
    )
    expect(uit).toHaveLength(1)
    expect(uit[0]).toContain('Kozijnen')
    // Wat er al stond is geen nieuws; dat herhalen maakt de melding langer en niet beter.
    expect(uit[0]).not.toContain('Schilderwerk')
  })

  it('meldt een leeggeruimde dag als zodanig', () => {
    const uit = planningVerschil([r('2026-09-16', 'Schilderwerk')], [])
    expect(uit).toEqual([expect.stringContaining('niets meer ingepland')])
  })

  it('meldt een vervallen blok op een dag waar nog ander werk staat', () => {
    const uit = planningVerschil(
      [r('2026-09-16', 'Schilderwerk'), r('2026-09-16', 'Kozijnen')],
      [r('2026-09-16', 'Schilderwerk')],
    )
    expect(uit).toEqual([expect.stringContaining('Kozijnen vervallen')])
  })

  it('noemt een verschoven blok op beide dagen', () => {
    // Een blok dat van woensdag naar donderdag gaat is op allebei de dagen nieuws:
    // je hoeft woensdag niet meer te komen en donderdag wel.
    const uit = planningVerschil(
      [r('2026-09-16', 'Kozijnen')],
      [r('2026-09-17', 'Kozijnen')],
    )
    expect(uit).toHaveLength(2)
    expect(uit[0]).toContain('niets meer ingepland')
    expect(uit[1]).toContain('Kozijnen')
  })

  it('houdt de dagen op volgorde', () => {
    const uit = planningVerschil([], [r('2026-09-18', 'B'), r('2026-09-16', 'A')])
    expect(uit[0]).toContain('A')
    expect(uit[1]).toContain('B')
  })
})
