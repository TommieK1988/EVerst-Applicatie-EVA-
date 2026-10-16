import { describe, expect, it } from 'vitest'
import type { Calculatieregel, Groep } from './types'
import {
  hoeveelheidTekst, openPakketten, pakketOmschrijving, partijWeergave, postenUitSelectie, standaardReactieUiterlijk,
} from './uitvraag-weergave'
import type { UitvraagPakket } from '@/lib/dossiers/uitvraag-pakket-types'

const groep = (id: string, naam: string, volgorde: number, parent_id: string | null = null) =>
  ({ id, naam, volgorde, parent_id, scenario_id: 's', niveau: 1 }) as Groep
const regel = (id: string, groep_id: string, volgorde: number, extra: Partial<Calculatieregel> = {}) =>
  ({ id, groep_id, volgorde, omschrijving: `Regel ${id}`, hoeveelheid: 2, eenheid: 'm2', ...extra }) as Calculatieregel

describe('postenUitSelectie', () => {
  const groepen = [groep('g2', 'Voegwerk', 2), groep('g1', 'Steiger', 1)]
  const regels = [
    regel('b', 'g2', 2), regel('a', 'g2', 1), regel('t', 'g2', 3, { soort: 'tekst' }), regel('s', 'g1', 1),
  ]

  it('één groep: groepsnaam als voorstel, tekstregels eruit, in rekenbladvolgorde', () => {
    const { posten, naamVoorstel } = postenUitSelectie(['b', 't', 'a'], regels, groepen)
    expect(posten.map(p => p.calculatieregel_id)).toEqual(['a', 'b'])
    expect(naamVoorstel).toBe('Voegwerk')
  })

  it('meerdere groepen: eerste omschrijving als voorstel', () => {
    const { posten, naamVoorstel } = postenUitSelectie(['b', 's'], regels, groepen)
    expect(posten.map(p => p.calculatieregel_id)).toEqual(['s', 'b'])
    expect(naamVoorstel).toBe('Regel s')
  })
})

describe('weergave', () => {
  it('hoeveelheid met eenheid', () => {
    expect(hoeveelheidTekst({ hoeveelheid: 64, eenheid: 'm2' })).toBe('64 m2')
    expect(hoeveelheidTekst({ hoeveelheid: null, eenheid: 'st' })).toBe('')
  })

  it('reactie standaard over 7 dagen', () => {
    expect(standaardReactieUiterlijk(new Date(2026, 9, 17, 10))).toBe('2026-10-24')
  })

  it('statuspil per partij', () => {
    expect(partijWeergave({ status: 'open', aangevraagd_op: null, dagen_open: null, rappels: 0 }))
      .toEqual({ label: 'Nog niet gemaild', toon: 'neutral', actie: 'mailen' })
    expect(partijWeergave({ status: 'open', aangevraagd_op: '2026-10-10', dagen_open: 6, rappels: 0 }).label)
      .toBe('Uitgevraagd · 6 d')
    expect(partijWeergave({ status: 'ontvangen', aangevraagd_op: 'x', dagen_open: 1, rappels: 0 }).label)
      .toBe('Offerte binnen')
  })

  it('kaartkop en teller', () => {
    const p = (status: string, aantalPosten: number) =>
      ({ posten: Array.from({ length: aantalPosten }), projectbezoek_op: null, partijen: [{ status }] }) as unknown as UitvraagPakket
    expect(pakketOmschrijving(p('open', 0))).toBe('los')
    expect(pakketOmschrijving(p('open', 1))).toBe('1 post')
    expect(pakketOmschrijving({ ...p('open', 3), soort: 'leverancier', inhoud: 'materialen' })).toBe('leverancier · 3 materialen')
    expect(openPakketten([p('open', 1), p('ontvangen', 2)])).toBe(1)
  })
})
