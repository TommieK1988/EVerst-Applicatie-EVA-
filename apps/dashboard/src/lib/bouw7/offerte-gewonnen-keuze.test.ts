import { describe, it, expect } from 'vitest'
import { kiesWinnendeOfferte } from './offerte-gewonnen-keuze'

const st = (name: string) => ({ id: 1, name })

describe('kiesWinnendeOfferte', () => {
  it('kiest de recentste open offerte (Rederserf: voorgevel van 18-09, niet de oudere van 15-06)', () => {
    const k = kiesWinnendeOfferte([
      { id: 3144413, quotationDate: '2026-06-15T00:00:00+02:00', subtotal: '23295.56', quotationStatus: st('07. Mondelinge toezegging') },
      { id: 3208113, quotationDate: '2026-09-18T00:00:00+02:00', subtotal: '7436.80', quotationStatus: st('03. Verstuurd') },
    ])
    expect(k).toMatchObject({ soort: 'zet_gewonnen', offerte: { id: 3208113 } })
  })

  it('doet niets als er al een offerte op Gewonnen staat', () => {
    const k = kiesWinnendeOfferte([
      { id: 1, quotationDate: '2026-06-01', quotationStatus: st('04. Gewonnen') },
      { id: 2, quotationDate: '2026-09-01', quotationStatus: st('03. Verstuurd') },
    ])
    expect(k).toMatchObject({ soort: 'al_gewonnen', offerte: { id: 1 } })
  })

  it('slaat verloren en vervallen offertes over', () => {
    const k = kiesWinnendeOfferte([
      { id: 1, quotationDate: '2026-06-01', quotationStatus: st('03. Verstuurd') },
      { id: 2, quotationDate: '2026-09-01', quotationStatus: st('05. Verloren') },
      { id: 3, quotationDate: '2026-09-02', quotationStatus: st('06. Vervallen') },
    ])
    expect(k).toMatchObject({ soort: 'zet_gewonnen', offerte: { id: 1 } })
  })

  it('geen offertes of alleen afgevallen: niets te doen', () => {
    expect(kiesWinnendeOfferte([])).toEqual({ soort: 'geen' })
    expect(kiesWinnendeOfferte([{ id: 1, quotationStatus: st('05. Verloren') }])).toEqual({ soort: 'geen' })
  })

  it('bij gelijke datum wint het hoogste id', () => {
    const k = kiesWinnendeOfferte([
      { id: 5, quotationDate: '2026-09-01', quotationStatus: st('01. Nieuw') },
      { id: 9, quotationDate: '2026-09-01', quotationStatus: st('01. Nieuw') },
    ])
    expect(k).toMatchObject({ offerte: { id: 9 } })
  })
})
