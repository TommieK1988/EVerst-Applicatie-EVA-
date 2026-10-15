import { describe, it, expect, vi } from 'vitest'
import type { Scenario } from './types'

// Het werkgeheugen werkt alleen in de browser; een leeg window-object is genoeg.
vi.stubGlobal('window', {})
const {
  slaScenarioOp, slaGroepOp, slaCalculatieregelOp, slaComponentregelOp,
  maakWerkbegrotingVanCalculatie, getWerkbegrotingRegels, getWerkbegrotingComponenten,
} = await import('./local-store')

/**
 * Het belangrijkste testpunt van de tijdtoeslag: de werkbegroting (en daarmee Bouw7,
 * planning en urenbewaking) krijgt de uren inclusief toeslag. Anders plant de
 * uitvoering 35 uur terwijl er 37,5 verkocht is.
 */
describe('werkbegroting krijgt de uren mét tijdtoeslag', () => {
  it('arbeid × factor, materiaal ongewijzigd', () => {
    slaScenarioOp({ id: 'wt-s', project_id: 'wt-p', naam: 'C', is_standaard: true, versie: 1 } as Scenario)
    slaGroepOp({ id: 'wt-g', scenario_id: 'wt-s', parent_id: null, naam: 'Gevel', niveau: 1, volgorde: 0, tijdtoeslag_pct: 20 })
    slaCalculatieregelOp({ id: 'wt-r', groep_id: 'wt-g', omschrijving: 'Kozijnen', hoeveelheid: 100, eenheid: 'm1', volgorde: 0 })
    slaComponentregelOp({ id: 'wt-a', calculatieregel_id: 'wt-r', type: 'arbeid', norm_hoeveelheid: 0.25, tarief: 58 })
    slaComponentregelOp({ id: 'wt-m', calculatieregel_id: 'wt-r', type: 'materieel', norm_hoeveelheid: 1, tarief: 2 })

    const wb = maakWerkbegrotingVanCalculatie('wt-p', 'wt-s')
    const [regel] = getWerkbegrotingRegels(wb.id)
    const comps = getWerkbegrotingComponenten(regel.id)
    expect(comps.find(c => c.type === 'arbeid')?.norm_hoeveelheid).toBeCloseTo(0.3)
    expect(comps.find(c => c.type === 'materieel')?.norm_hoeveelheid).toBe(1)
  })
})
