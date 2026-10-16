import { describe, it, expect } from 'vitest'
import { heeftEigenTarief, volgtCalculatietarief } from './calculatietarief'

describe('calculatietarief', () => {
  it('volgt het tarief bij gelijk of leeg tarief', () => {
    expect(volgtCalculatietarief(58, 58)).toBe(true)
    expect(volgtCalculatietarief(0, 58)).toBe(true)
    expect(volgtCalculatietarief(undefined, 58)).toBe(true)
    expect(volgtCalculatietarief(52, 58)).toBe(false)
  })
  it('eigen tarief alleen bij arbeid met uren', () => {
    expect(heeftEigenTarief({ type: 'arbeid', tarief: 52, norm_hoeveelheid: 0.5 }, 58)).toBe(true)
    expect(heeftEigenTarief({ type: 'arbeid', tarief: 52, norm_hoeveelheid: 0 }, 58)).toBe(false)
    expect(heeftEigenTarief({ type: 'materieel', tarief: 52, norm_hoeveelheid: 1 }, 58)).toBe(false)
    expect(heeftEigenTarief({ type: 'arbeid', tarief: 52, norm_hoeveelheid: 1 }, 0)).toBe(false)
  })
})
