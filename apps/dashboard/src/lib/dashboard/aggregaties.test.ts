import { describe, expect, it } from 'vitest'
import { berekenFunnel, berekenCalculatorStats, type FunnelDossier } from './aggregaties'

const NU = '2026-09-16T12:00:00.000Z'

function dossier(over: Partial<FunnelDossier> = {}): FunnelDossier {
  return {
    hoofdstatus: 'offerte',
    aanvraag_substatus: null,
    offerte_substatus: 'verzonden',
    opdracht_substatus: null,
    bedrag_excl_btw: 10_000,
    categorie: null,
    bouw7_filiaal: null,
    calculator_id: null,
    created_at: '2026-03-01T09:00:00.000Z',
    verzonden_op: '2026-03-01T09:00:00.000Z',
    ...over,
  }
}

/** Geïmporteerde historie: verstuurd in een eerder jaar, uitkomst allang bekend. */
const oudVerloren = dossier({
  offerte_substatus: 'verloren',
  created_at: '2024-05-01T09:00:00.000Z',
  verzonden_op: '2024-05-01T09:00:00.000Z',
})
const oudGewonnen = dossier({
  hoofdstatus: 'opdracht',
  offerte_substatus: null,
  opdracht_substatus: 'financieel_afgesloten',
  created_at: '2025-06-01T09:00:00.000Z',
  verzonden_op: '2025-06-01T09:00:00.000Z',
})

describe('funnel: uitkomsten zijn begrensd op het lopende jaar', () => {
  it('telt win en verlies van eerdere jaren niet mee', () => {
    const f = berekenFunnel(
      [
        dossier({ hoofdstatus: 'opdracht', offerte_substatus: null, opdracht_substatus: 'onderhanden' }),
        dossier({ offerte_substatus: 'verloren' }),
        oudGewonnen,
        oudVerloren,
      ],
      [],
      NU,
    )
    expect(f.gewonnen.aantal).toBe(1)
    expect(f.verloren.aantal).toBe(1)
    expect(f.winRateAantal).toBe(50)
  })

  it('houdt oude openstaande offertes wél in de pijplijn', () => {
    // Precies het geval van de geïmporteerde Gilde-offertes: jaren oud, nog te bewaken.
    const f = berekenFunnel(
      [dossier({ created_at: '2024-01-24T09:00:00.000Z', verzonden_op: '2024-01-24T09:00:00.000Z' })],
      [],
      NU,
    )
    expect(f.openOffertes.aantal).toBe(1)
    expect(f.gewonnen.aantal).toBe(0)
    expect(f.verloren.aantal).toBe(0)
  })

  it('valt terug op created_at als de verzenddatum ontbreekt', () => {
    // Bouw7-opdrachten hebben vrijwel nooit een verzenddatum; op verzonden_op alleen
    // filteren zou de winkant leegmaken.
    const f = berekenFunnel(
      [dossier({
        hoofdstatus: 'opdracht', offerte_substatus: null, opdracht_substatus: 'onderhanden',
        verzonden_op: null, created_at: '2026-02-01T09:00:00.000Z',
      })],
      [],
      NU,
    )
    expect(f.gewonnen.aantal).toBe(1)
  })

  it('laat "vervallen" als verlies tellen, niet als open offerte', () => {
    const f = berekenFunnel([dossier({ offerte_substatus: 'vervallen' })], [], NU)
    expect(f.verloren.aantal).toBe(1)
    expect(f.openOffertes.aantal).toBe(0)
  })
})

describe('calculatorprestaties', () => {
  const namen = new Map([['calc-1', { naam: 'Test Calculator', kleur: null }]])

  it('rekent oude trajecten niet mee in win/verlies', () => {
    const stats = berekenCalculatorStats(
      [
        dossier({ calculator_id: 'calc-1', hoofdstatus: 'opdracht', offerte_substatus: null, opdracht_substatus: 'onderhanden' }),
        { ...oudGewonnen, calculator_id: 'calc-1' },
        { ...oudVerloren, calculator_id: 'calc-1' },
      ],
      namen,
      NU,
    )
    expect(stats).toHaveLength(1)
    expect(stats[0].gewonnen).toBe(1)
    expect(stats[0].verloren).toBe(0)
  })

  it('telt een oude openstaande offerte wél in de open pijplijn', () => {
    const stats = berekenCalculatorStats(
      [dossier({ calculator_id: 'calc-1', bedrag_excl_btw: 25_000, created_at: '2024-01-24T09:00:00.000Z', verzonden_op: '2024-01-24T09:00:00.000Z' })],
      namen,
      NU,
    )
    expect(stats[0].openPipelineWaarde).toBe(25_000)
    expect(stats[0].offertes).toBe(0)
  })
})
