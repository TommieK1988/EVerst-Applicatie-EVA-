import { describe, it, expect } from 'vitest'
import { kiesAfTeSluitenOffertes } from './offerte-afgesloten'

const q = (id: number, name: string) => ({ id, quotationStatus: { id: 1, name } })

describe('kiesAfTeSluitenOffertes', () => {
  it('neemt alleen de offertes mee die nog leven', () => {
    const uit = kiesAfTeSluitenOffertes([
      q(1, '03. Verstuurd'),
      q(2, '07. Mondelinge toezegging'),
      q(3, '05. Verloren'),
      q(4, '06. Vervallen'),
      q(5, '01. Nieuw'),
    ])
    expect(uit.map(o => o.id)).toEqual([1, 2, 5])
  })

  it('laat een gewonnen offerte altijd staan', () => {
    expect(kiesAfTeSluitenOffertes([q(1, '04. Gewonnen'), q(2, '03. Verstuurd')]).map(o => o.id)).toEqual([2])
  })

  it('een offerte zonder status leeft nog', () => {
    expect(kiesAfTeSluitenOffertes([{ id: 9 }]).map(o => o.id)).toEqual([9])
  })
})
