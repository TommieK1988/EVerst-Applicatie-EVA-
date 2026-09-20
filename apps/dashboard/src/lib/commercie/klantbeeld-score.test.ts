import { describe, expect, it } from 'vitest'
import { berekenScore, MIN_BESLIST_VOOR_PERCENTAGE, type ScoreVelden } from './klantbeeld-score'
import { jaarVoorKlantbeeld } from './klantbeeld-types'

type Invoer = ScoreVelden & {
  bouw7_aanmaakdatum?: string | null
  aanvraagdatum?: string | null
  created_at?: string
}

function dossier(over: Partial<Invoer> = {}): Invoer {
  return {
    fase: 'offerte',
    hoofdstatus: 'offerte',
    offerte_substatus: 'nabellen',
    servicedesk_substatus: null,
    verzonden_op: '2026-01-15',
    bouw7_aanmaakdatum: null,
    aanvraagdatum: null,
    created_at: '2026-06-09T00:00:00Z',
    ...over,
  }
}

/** Een gewonnen offerte zoals de database hem ná de trigger achterlaat. */
const gewonnen = (over: Partial<Invoer> = {}) =>
  dossier({ fase: 'opdracht', hoofdstatus: 'opdracht', offerte_substatus: null, ...over })

const verloren = (over: Partial<Invoer> = {}) =>
  dossier({ fase: 'afgesloten', offerte_substatus: 'verloren', ...over })

describe('berekenScore — de trigger-valkuil', () => {
  it('telt een gewonnen offerte op hoofdstatus, niet op de substatus', () => {
    // De trigger heeft 'gewonnen' al weggeschreven naar hoofdstatus 'opdracht' en de
    // substatus op null gezet. Tellen op de substatus zou hier 0 opleveren.
    const r = berekenScore([gewonnen(), gewonnen(), gewonnen(), verloren(), verloren()])
    expect(r.gewonnen).toBe(3)
    expect(r.verloren).toBe(2)
    expect(r.percentage).toBe(60)
  })

  it('ziet financieel afgesloten werk nog steeds als gewonnen', () => {
    const r = berekenScore([
      gewonnen({ fase: 'afgesloten' }), gewonnen(), gewonnen(), gewonnen(), verloren(),
    ])
    expect(r.gewonnen).toBe(4)
  })
})

describe('berekenScore — wat niet meetelt', () => {
  it('laat servicedeskbonnen buiten de score', () => {
    const r = berekenScore([
      dossier({ fase: 'servicedesk', hoofdstatus: 'aanvraag', servicedesk_substatus: 'loopt' }),
      gewonnen(), gewonnen(), verloren(), verloren(),
    ])
    expect(r.gewonnen).toBe(2)
    expect(r.verloren).toBe(2)
  })

  it('laat een aanvraag die de offertefase nooit bereikte buiten beschouwing', () => {
    const nogInBegroting = dossier({
      fase: 'aanvraag', hoofdstatus: 'aanvraag', offerte_substatus: null, verzonden_op: null,
    })
    const r = berekenScore([nogInBegroting, gewonnen(), gewonnen(), verloren(), verloren()])
    expect(r.gewonnen + r.verloren + r.open).toBe(4)
  })

  it('telt een vervallen offerte als verloren', () => {
    const r = berekenScore([
      verloren({ offerte_substatus: 'vervallen' }), verloren(), gewonnen(), gewonnen(),
    ])
    expect(r.verloren).toBe(2)
  })

  it('houdt openstaande offertes buiten het percentage', () => {
    const open = dossier({ offerte_substatus: 'in_behandeling' })
    const r = berekenScore([open, open, gewonnen(), gewonnen(), gewonnen(), verloren()])
    expect(r.open).toBe(2)
    // 3 van 4 beslist, niet 3 van 6.
    expect(r.percentage).toBe(75)
  })
})

describe('berekenScore — percentage pas bij genoeg beslissingen', () => {
  it('geeft geen percentage bij één gewonnen en één verloren', () => {
    const r = berekenScore([gewonnen(), verloren()])
    expect(r.gewonnen).toBe(1)
    expect(r.verloren).toBe(1)
    expect(r.percentage).toBeNull()
  })

  it('geeft wél een percentage vanaf de drempel', () => {
    const rijen = [gewonnen(), gewonnen(), verloren(), verloren()]
    expect(rijen.length).toBe(MIN_BESLIST_VOOR_PERCENTAGE)
    expect(berekenScore(rijen).percentage).toBe(50)
  })

  it('geeft geen percentage zonder enige beslissing', () => {
    expect(berekenScore([]).percentage).toBeNull()
    expect(berekenScore([dossier()]).percentage).toBeNull()
  })
})

describe('berekenScore — periode', () => {
  it('neemt het vroegste jaar, ook uit een openstaande offerte', () => {
    const r = berekenScore([
      gewonnen({ verzonden_op: '2026-03-01' }),
      verloren({ verzonden_op: '2024-01-23' }),
    ])
    expect(r.vanafJaar).toBe(2024)
  })
})

describe('jaarVoorKlantbeeld — de Gilde-correctie', () => {
  it('gebruikt verzonden_op als de Bouw7-datum ontbreekt', () => {
    // Zo ziet een geïmporteerd Gilde-dossier eruit: geen Bouw7-datum, geen aanvraagdatum,
    // created_at is de importdag. jaarVan() zou hier 2026 teruggeven.
    expect(jaarVoorKlantbeeld({
      bouw7_aanmaakdatum: null,
      verzonden_op:       '2024-01-23',
      aanvraagdatum:      null,
      created_at:         '2026-09-16T00:00:00Z',
    })).toBe(2024)
  })

  it('laat de Bouw7-datum voorgaan op verzonden_op', () => {
    expect(jaarVoorKlantbeeld({
      bouw7_aanmaakdatum: '2025-10-02',
      verzonden_op:       '2026-02-01',
      aanvraagdatum:      null,
      created_at:         '2026-06-09T00:00:00Z',
    })).toBe(2025)
  })

  it('valt terug op created_at als er verder niets is', () => {
    expect(jaarVoorKlantbeeld({
      bouw7_aanmaakdatum: null, verzonden_op: null, aanvraagdatum: null,
      created_at: '2026-06-09T00:00:00Z',
    })).toBe(2026)
  })

  it('geeft null bij een onbruikbare datum', () => {
    expect(jaarVoorKlantbeeld({
      bouw7_aanmaakdatum: null, verzonden_op: null, aanvraagdatum: null, created_at: '',
    })).toBeNull()
  })
})
