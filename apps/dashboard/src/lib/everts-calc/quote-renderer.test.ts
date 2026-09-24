import { describe, expect, it } from 'vitest'
import { groepeerBtwPerTarief } from './quote-renderer'
import type { QuoteSection } from './types-quotes'

const hoog = { id: 'hoog', label: 'Hoog 21%', percentage: 21, verlegd: false }
const verlegdHoog = { id: 'verlegd-hoog', label: 'Verlegd Hoog 21%', percentage: 21, verlegd: true }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sectie = (lines: any[]): QuoteSection => ({ is_optioneel: false, lines } as unknown as QuoteSection)

describe('groepeerBtwPerTarief', () => {
  it('voegt regels zonder tarief samen met het gewone tarief van hetzelfde percentage', () => {
    // Zamenhofstraat 6 (sep 2026): 9 regels "Hoog 21%", 10 regels alleen 21 → twee keer 21%.
    const uit = groepeerBtwPerTarief([sectie([
      { btw_pct: 21, btw_tarief: hoog, line_total: 100 },
      { btw_pct: 21, btw_tarief: null, line_total: 200 },
    ])], 21)

    expect(uit).toHaveLength(1)
    expect(uit[0].label).toBe('Hoog 21%')
    expect(uit[0].grondslag_raw).toBe('300,00')
  })

  it('schuift een regel zonder tarief niet onder een verlegd tarief', () => {
    const uit = groepeerBtwPerTarief([sectie([
      { btw_pct: 21, btw_tarief: verlegdHoog, line_total: 100 },
      { btw_pct: 21, btw_tarief: null, line_total: 200 },
    ])], 21)

    expect(uit).toHaveLength(2)
    expect(uit.find(g => g.verlegd)?.grondslag_raw).toBe('100,00')
    expect(uit.find(g => !g.verlegd)?.grondslag_raw).toBe('200,00')
  })
})
