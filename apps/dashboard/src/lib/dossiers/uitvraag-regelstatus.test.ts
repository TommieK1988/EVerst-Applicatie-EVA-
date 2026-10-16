import { describe, it, expect } from 'vitest'
import { regelUitvraagStatussen } from './uitvraag-regelstatus'
import type { UitvraagPakket, UitvraagPakketPartij } from './uitvraag-pakket-types'

const partij = (naam: string, status: string, rekent_mee = false) =>
  ({ partij_naam: naam, status, rekent_mee } as unknown as UitvraagPakketPartij)
const pakket = (id: string, regels: string[], partijen: UitvraagPakketPartij[]) =>
  ({ id, posten: regels.map(r => ({ calculatieregel_id: r, omschrijving: r, hoeveelheid: 1, eenheid: 'st' })), partijen } as unknown as UitvraagPakket)

describe('regelUitvraagStatussen', () => {
  it('telt partijen zonder ingetrokken of afgevallen', () => {
    const m = regelUitvraagStatussen([pakket('p1', ['r1', 'r2'], [partij('A', 'open'), partij('B', 'ontvangen'), partij('C', 'ingetrokken')])])
    expect(m.get('r1')).toEqual({ uitgevraagd: 2, rekentMet: null, pakketId: 'p1' })
    expect(m.get('r2')?.uitgevraagd).toBe(2)
  })

  it('pakket met "rekent met" wint van een nieuwer pakket zonder', () => {
    const m = regelUitvraagStatussen([
      pakket('nieuw', ['r1'], [partij('X', 'open')]),
      pakket('oud', ['r1'], [partij('A', 'ontvangen', true)]),
    ])
    expect(m.get('r1')).toEqual({ uitgevraagd: 1, rekentMet: 'A', pakketId: 'oud' })
  })

  it('losse uitvraag zonder posten raakt geen regels', () => {
    expect(regelUitvraagStatussen([pakket('los', [], [partij('A', 'open')])]).size).toBe(0)
  })
})
