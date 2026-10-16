import { describe, it, expect } from 'vitest'
import {
  uniekePosten, controleerOffertePdf, controleerPakket, offerteBestandsnaam, MAX_OFFERTE_BYTES,
} from './uitvraag-pakket-invoer'
import type { NieuwUitvraagPakket } from './uitvraag-pakket-types'

const basis: NieuwUitvraagPakket = {
  dossierId: 'd1',
  naam: '  Voegwerk gevel achter ',
  soort: 'onderaannemer',
  inhoud: 'posten',
  scenarioId: 's1',
  posten: [],
  partijen: [{ relatie_id: 'r1', naam: 'Voegbedrijf A' }],
  reactieUiterlijk: '2026-10-30',
  projectbezoekOp: null,
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-

describe('controleerPakket', () => {
  it('eist een naam en minimaal één partij', () => {
    expect(controleerPakket({ ...basis, naam: '  ' }).ok).toBe(false)
    expect(controleerPakket({ ...basis, partijen: [] }).ok).toBe(false)
    expect(controleerPakket({ ...basis, partijen: [{ relatie_id: null, naam: ' ' }] }).ok).toBe(false)
  })

  it('haalt dubbele partijen en posten eruit, de eerste wint', () => {
    const r = controleerPakket({
      ...basis,
      partijen: [
        { relatie_id: 'r1', naam: 'Voegbedrijf A' },
        { relatie_id: 'r2', naam: 'Voegbedrijf B' },
        { relatie_id: 'r1', naam: 'Voegbedrijf A (dubbel)' },
        { relatie_id: null, naam: 'Losse partij' },
        { relatie_id: null, naam: 'losse PARTIJ' },
      ],
      posten: [
        { calculatieregel_id: 'a', omschrijving: 'A', hoeveelheid: 2, eenheid: 'm' },
        { calculatieregel_id: 'a', omschrijving: 'A2', hoeveelheid: 3, eenheid: 'm' },
        { calculatieregel_id: 'b', omschrijving: 'B', hoeveelheid: null, eenheid: null },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.naam).toBe('Voegwerk gevel achter')
    expect(r.data.partijen.map(p => p.naam)).toEqual(['Voegbedrijf A', 'Voegbedrijf B', 'Losse partij'])
    expect(r.data.posten.map(p => p.omschrijving)).toEqual(['A', 'B'])
  })

  it('weigert een ongeldige datum of tijd', () => {
    expect(controleerPakket({ ...basis, reactieUiterlijk: '30-10-2026' }).ok).toBe(false)
    expect(controleerPakket({ ...basis, projectbezoekOp: 'morgen' }).ok).toBe(false)
  })
})

describe('controleerOffertePdf', () => {
  it('accepteert een echte pdf', () => {
    expect(controleerOffertePdf('offerte.PDF', 1000, PDF)).toBeNull()
  })

  it('weigert andere bestanden, lege en te grote', () => {
    expect(controleerOffertePdf('offerte.docx', 1000, new Uint8Array([0x50, 0x4b, 3, 4, 0]))).not.toBeNull()
    expect(controleerOffertePdf('nep.pdf', 1000, new Uint8Array([0x50, 0x4b, 3, 4, 0]))).not.toBeNull()
    expect(controleerOffertePdf('offerte.pdf', 0, PDF)).not.toBeNull()
    expect(controleerOffertePdf('offerte.pdf', MAX_OFFERTE_BYTES + 1, PDF)).toMatch(/7,5 MB/)
  })
})

describe('offerteBestandsnaam', () => {
  it('maakt een veilige naam met datum', () => {
    expect(offerteBestandsnaam('Bouw/Voeg: "A"', 'Gevel #2', '2026-10-16'))
      .toBe('Offerte BouwVoeg A - Gevel 2 2026-10-16.pdf')
  })

  it('materiaallijst: regels zonder calculatieregel blijven, lege omschrijvingen vallen weg', () => {
    const r = uniekePosten([
      { calculatieregel_id: '', omschrijving: 'Dekkende lak', hoeveelheid: 2, eenheid: 'ltr' },
      { calculatieregel_id: '', omschrijving: 'Kit', hoeveelheid: 4, eenheid: 'st' },
      { calculatieregel_id: '', omschrijving: '  ', hoeveelheid: 1, eenheid: null },
    ])
    expect(r.map(p => p.omschrijving)).toEqual(['Dekkende lak', 'Kit'])
  })
})
