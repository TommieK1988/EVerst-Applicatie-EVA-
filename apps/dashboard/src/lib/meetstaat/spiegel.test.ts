import { describe, it, expect } from 'vitest'
import { spiegelRijen, type SpiegelInvoer, type SpiegelContext } from './spiegel'
import type { Groep, Meetregel, Meetstaat } from '@/lib/everts-calc/types'

const ctx: SpiegelContext = {
  projectId: 'p1', dossierId: 'd1', objectId: 'o1', nu: '2026-10-15T10:00:00.000Z',
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const groep = (id: string, naam: string, parent_id: string | null = null): Groep => ({
  id, scenario_id: 's1', parent_id, naam, niveau: parent_id ? 2 : 1, volgorde: 1,
})

const meetstaat: Meetstaat = {
  id: 'm1', project_id: 'p1', scenario_id: 's1', naam: 'Meetstaat buiten', code: 'MS-1',
  status: 'concept', aangemaakt_op: '', aangepast_op: '',
}

const regel = (id: string, groep_id: string, extra: Partial<Meetregel> = {}): Meetregel => ({
  id, meetstaat_id: 'm1', groep_id, volgorde: 1, aantal: 2, eenheid: 'm²',
  is_leeg: false, aangepast_op: '2026-09-01T08:00:00.000Z', ...extra,
})

const invoer = (regels: Meetregel[], groepen: Groep[]): SpiegelInvoer => ({
  groepen, meetstaten: [meetstaat], meetregels: regels,
})

describe('spiegelRijen', () => {
  it('maakt van een groep met bovengroep twee delen: deel › subdeel', () => {
    const r = spiegelRijen(invoer(
      [regel('r1', 'g2')],
      [groep('g1', 'Blok A'), groep('g2', 'Voorgevel', 'g1')],
    ), ctx)
    expect(r.delen).toEqual([
      expect.objectContaining({ id: 'g1', naam: 'Blok A', parent_id: null, dossier_id: 'd1', object_id: 'o1' }),
      expect.objectContaining({ id: 'g2', naam: 'Voorgevel', parent_id: 'g1' }),
    ])
    expect(r.regels[0].deel_id).toBe('g2')
  })

  it('wordt nooit dieper dan twee niveaus, ook als een subdeel zelf ouder is', () => {
    // g3 › g2 › g1: g2 is subdeel van g1 én ouder van g3. Dan blijft g2 bovenaan.
    const groepen = [groep('g1', 'Complex'), groep('g2', 'Blok A', 'g1'), groep('g3', 'Voorgevel', 'g2')]
    for (const volgorde of [['r2', 'r3'], ['r3', 'r2']]) {
      const regels = volgorde.map(id => regel(id, id === 'r2' ? 'g2' : 'g3'))
      const delen = spiegelRijen(invoer(regels, groepen), ctx).delen
      const g2 = delen.find(d => d.id === 'g2')
      const g3 = delen.find(d => d.id === 'g3')
      expect(g2?.parent_id).toBeNull()
      expect(g3?.parent_id).toBe('g2')
      // Elk deel met een ouder hangt onder een deel zonder ouder.
      for (const d of delen.filter(x => x.parent_id)) {
        expect(delen.find(x => x.id === d.parent_id)?.parent_id).toBeNull()
      }
    }
  })

  it('slaat lege invoerregels en regels van een verdwenen meetstaat over', () => {
    const r = spiegelRijen(invoer(
      [regel('r1', 'g1'), regel('r2', 'g1', { is_leeg: true }), regel('r3', 'g1', { meetstaat_id: 'weg' })],
      [groep('g1', 'Voorgevel')],
    ), ctx)
    expect(r.regels.map(x => x.id)).toEqual(['r1'])
  })

  it('neemt de maten over en zet de oude naam omschrijving om naar opmerking', () => {
    const r = spiegelRijen(invoer(
      [regel('r1', 'g1', {
        breedte: 1.2, hoogte: 2.4, breedte_aantal: 2, factor: 3, bestekcode: ' S-01 ',
        omschrijving: 'oud veld', onderdeel: 'Kozijnen',
      })],
      [groep('g1', 'Voorgevel')],
    ), ctx).regels[0]
    expect(r).toMatchObject({
      breedte: 1.2, hoogte: 2.4, breedte_aantal: 2, hoogte_aantal: null, factor: 3,
      aantal: 2, eenheid: 'm²', bestekcode: 'S-01', opmerking: 'oud veld', onderdeel: 'Kozijnen',
      soort: 'schilderwerk', vervallen_op: null, opgemeten_op: '2026-09-01T08:00:00.000Z',
    })
  })

  it('laat een bibliotheek-id weg als het geen uuid is', () => {
    const r = spiegelRijen(invoer(
      [regel('r1', 'g1', { onderdeel_id: U(1), type_id: 'eigen-type', behandeling_id: '' })],
      [groep('g1', 'Voorgevel')],
    ), ctx).regels[0]
    expect(r.onderdeel_id).toBe(U(1))
    expect(r.type_id).toBeNull()
    expect(r.behandeling_id).toBeNull()
  })

  it('regel zonder bestaande groep krijgt geen deel', () => {
    const r = spiegelRijen(invoer([regel('r1', 'weg')], [groep('g1', 'Voorgevel')]), ctx)
    expect(r.regels[0].deel_id).toBeNull()
    expect(r.delen).toEqual([])
  })

  it('legt per meetstaat vast welke calculatie hem gebruikt', () => {
    const r = spiegelRijen(invoer([], []), ctx)
    expect(r.meetstaten).toEqual([
      { id: 'm1', dossier_id: 'd1', object_id: 'o1', naam: 'Meetstaat buiten', code: 'MS-1', bron: 'eva' },
    ])
    expect(r.gebruik).toEqual([{ meetstaat_id: 'm1', project_id: 'p1', scenario_id: 's1' }])
  })

  it('zonder meetstaten: niets', () => {
    const r = spiegelRijen({ groepen: [] }, ctx)
    expect(r).toEqual({ meetstaten: [], delen: [], regels: [], gebruik: [] })
  })
})
