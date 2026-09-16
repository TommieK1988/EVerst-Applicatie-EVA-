import { describe, expect, it } from 'vitest'
import {
  berekenCommercieCijfers, STILSTAND_DAGEN,
  type RapportageInvoer, type RapportageDossier, type RapportageBewaking,
} from './rapportage'

const NU = '2026-09-16T12:00:00.000Z'

function dossier(over: Partial<RapportageDossier> & { id: string }): RapportageDossier {
  return {
    titel: `Dossier ${over.id}`,
    hoofdstatus: 'offerte',
    offerte_substatus: 'nabellen',
    bedrag_excl_btw: 100_000,
    verzonden_op: '2026-09-01T09:00:00.000Z',
    ...over,
  }
}

function invoer(over: Partial<RapportageInvoer> = {}): RapportageInvoer {
  return {
    dossiers: [], bewaking: [], eigenaarNamen: {}, fasewissels: [],
    laatsteBeweging: {}, nu: NU,
    ...over,
  }
}

describe('kans-gewogen pijplijn', () => {
  it('weegt elk bedrag naar rato van de kans', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a', bedrag_excl_btw: 200_000 }), dossier({ id: 'b', bedrag_excl_btw: 100_000 })],
      bewaking: [
        { dossier_id: 'a', eigenaar_id: null, kans_pct: 70, verwachte_opdracht: '2026-10-01' },
        { dossier_id: 'b', eigenaar_id: null, kans_pct: 20, verwachte_opdracht: '2026-10-01' },
      ],
    }))
    expect(r.openWaarde).toBe(300_000)
    expect(r.gewogenWaarde).toBe(160_000) // 140k + 20k
  })

  it('telt offertes zonder kans niet mee, maar meldt ze wel', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a' }), dossier({ id: 'b' })],
      bewaking: [{ dossier_id: 'a', eigenaar_id: null, kans_pct: 50, verwachte_opdracht: '2026-11-01' }],
    }))
    expect(r.gewogenWaarde).toBe(50_000)
    expect(r.metKans).toBe(1)
    // b heeft geen kaart, a wel — de prognose is dus een ondergrens.
    expect(r.zonderKans).toBe(1)
  })

  it('plaatst een kans zonder verwachte maand niet in de tijdreeks', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a' })],
      bewaking: [{ dossier_id: 'a', eigenaar_id: null, kans_pct: 80, verwachte_opdracht: null }],
    }))
    expect(r.gewogenWaarde).toBe(80_000)
    expect(r.perMaand).toEqual([])
  })

  it('bundelt per maand en houdt chronologische volgorde aan', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [
        dossier({ id: 'a', bedrag_excl_btw: 100_000 }),
        dossier({ id: 'b', bedrag_excl_btw: 50_000 }),
        dossier({ id: 'c', bedrag_excl_btw: 40_000 }),
      ],
      bewaking: [
        { dossier_id: 'a', eigenaar_id: null, kans_pct: 50, verwachte_opdracht: '2026-12-01' },
        { dossier_id: 'b', eigenaar_id: null, kans_pct: 50, verwachte_opdracht: '2026-10-01' },
        { dossier_id: 'c', eigenaar_id: null, kans_pct: 50, verwachte_opdracht: '2026-10-01' },
      ],
    }))
    expect(r.perMaand.map(m => m.maand)).toEqual(['okt 26', 'dec 26'])
    expect(r.perMaand[0]).toMatchObject({ gewogen: 45_000, aantal: 2 })
  })

  it('laat gesloten offertes buiten de pijplijn', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [
        dossier({ id: 'verloren', offerte_substatus: 'verloren' }),
        dossier({ id: 'vervallen', offerte_substatus: 'vervallen' }),
        dossier({ id: 'gewonnen', hoofdstatus: 'opdracht', offerte_substatus: null }),
        dossier({ id: 'aanvraag', hoofdstatus: 'aanvraag', offerte_substatus: null }),
      ],
    }))
    expect(r.openWaarde).toBe(0)
  })
})

describe('tijd per fase', () => {
  const wissels = [
    { dossier_id: 'a', van: null, naar: 'verzonden', op: '2026-01-01T00:00:00.000Z' },
    { dossier_id: 'a', van: 'verzonden', naar: 'nabellen', op: '2026-01-11T00:00:00.000Z' },
    { dossier_id: 'a', van: 'nabellen', naar: 'in_behandeling', op: '2026-01-15T00:00:00.000Z' },
  ]

  it('meet de duur tussen twee opeenvolgende overgangen', () => {
    const r = berekenCommercieCijfers(invoer({ fasewissels: wissels }))
    const verzonden = r.perFase.find(f => f.fase === 'verzonden')
    expect(verzonden?.gemDagen).toBe(10)
    const nabellen = r.perFase.find(f => f.fase === 'nabellen')
    expect(nabellen?.gemDagen).toBe(4)
  })

  it('telt de fase waar de offerte nú in zit niet mee', () => {
    // in_behandeling is de laatste overgang: die duur staat nog niet vast.
    const r = berekenCommercieCijfers(invoer({ fasewissels: wissels }))
    expect(r.perFase.find(f => f.fase === 'in_behandeling')).toBeUndefined()
  })

  it('houdt dossiers uit elkaar', () => {
    const r = berekenCommercieCijfers(invoer({
      fasewissels: [
        ...wissels,
        { dossier_id: 'b', van: null, naar: 'verzonden', op: '2026-03-01T00:00:00.000Z' },
        { dossier_id: 'b', van: 'verzonden', naar: 'nabellen', op: '2026-03-21T00:00:00.000Z' },
      ],
    }))
    const verzonden = r.perFase.find(f => f.fase === 'verzonden')
    expect(verzonden?.aantal).toBe(2)
    expect(verzonden?.gemDagen).toBe(15) // (10 + 20) / 2
    expect(verzonden?.medDagen).toBe(15)
  })

  it('negeert overgangen die terug in de tijd lopen', () => {
    const r = berekenCommercieCijfers(invoer({
      fasewissels: [
        { dossier_id: 'x', van: null, naar: 'verzonden', op: '2026-01-10T00:00:00.000Z' },
        { dossier_id: 'x', van: 'verzonden', naar: 'nabellen', op: '2026-01-10T00:00:00.000Z' },
      ],
    }))
    // Gelijke tijdstempels geven 0 dagen — dat is geldig, geen negatieve duur.
    expect(r.perFase.find(f => f.fase === 'verzonden')?.gemDagen).toBe(0)
  })

  it('laat fases zonder metingen weg in plaats van nullen te tonen', () => {
    const r = berekenCommercieCijfers(invoer({ fasewissels: wissels }))
    expect(r.perFase.map(f => f.fase)).toEqual(['verzonden', 'nabellen'])
  })
})

describe('conversie per eigenaar', () => {
  const bewaking: RapportageBewaking[] = [
    { dossier_id: 'w1', eigenaar_id: 'm1', kans_pct: null, verwachte_opdracht: null },
    { dossier_id: 'w2', eigenaar_id: 'm1', kans_pct: null, verwachte_opdracht: null },
    { dossier_id: 'v1', eigenaar_id: 'm1', kans_pct: null, verwachte_opdracht: null },
    { dossier_id: 'o1', eigenaar_id: 'm1', kans_pct: 40, verwachte_opdracht: null },
  ]
  const dossiers = [
    dossier({ id: 'w1', hoofdstatus: 'opdracht', offerte_substatus: null }),
    dossier({ id: 'w2', hoofdstatus: 'opdracht', offerte_substatus: null }),
    dossier({ id: 'v1', offerte_substatus: 'verloren' }),
    dossier({ id: 'o1', bedrag_excl_btw: 50_000 }),
  ]

  it('rekent de winrate alleen over besliste trajecten', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers, bewaking, eigenaarNamen: { m1: 'Bas de Vries' },
    }))
    const bas = r.perEigenaar[0]
    expect(bas.naam).toBe('Bas de Vries')
    expect(bas.offertes).toBe(4)
    expect(bas.gewonnen).toBe(2)
    expect(bas.verloren).toBe(1)
    // 2 van 3 besliste trajecten — de open offerte telt niet mee.
    expect(bas.winrate).toBeCloseTo(66.67, 1)
    expect(bas.openAantal).toBe(1)
    expect(bas.openWaarde).toBe(50_000)
    expect(bas.gewogen).toBe(20_000)
  })

  it('geeft geen winrate zonder besliste trajecten', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'o1' })],
      bewaking: [{ dossier_id: 'o1', eigenaar_id: 'm1', kans_pct: null, verwachte_opdracht: null }],
      eigenaarNamen: { m1: 'Bas' },
    }))
    expect(r.perEigenaar[0].winrate).toBeNull()
  })

  it('slaat dossiers zonder eigenaar over', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'x' })],
      bewaking: [{ dossier_id: 'x', eigenaar_id: null, kans_pct: null, verwachte_opdracht: null }],
    }))
    expect(r.perEigenaar).toEqual([])
  })
})

describe('offertes zonder beweging', () => {
  it('telt vanaf de laatste beweging, niet vanaf de verzenddatum', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a', verzonden_op: '2026-01-01T00:00:00.000Z' })],
      laatsteBeweging: { a: '2026-09-14T12:00:00.000Z' },
    }))
    // Twee dagen geleden bewogen: dus níét stil, ondanks een oude verzenddatum.
    expect(r.stilstaand).toEqual([])
  })

  it('valt terug op de verzenddatum als er nooit beweging was', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a', verzonden_op: '2026-08-01T12:00:00.000Z' })],
    }))
    expect(r.stilstaand).toHaveLength(1)
    expect(r.stilstaand[0].dagen).toBe(46)
  })

  it('gebruikt de drempel als ondergrens', () => {
    const netAan = new Date(Date.parse(NU) - STILSTAND_DAGEN * 86_400_000).toISOString()
    const netNiet = new Date(Date.parse(NU) - (STILSTAND_DAGEN - 1) * 86_400_000).toISOString()
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'aan' }), dossier({ id: 'niet' })],
      laatsteBeweging: { aan: netAan, niet: netNiet },
    }))
    expect(r.stilstaand.map(s => s.dossier_id)).toEqual(['aan'])
  })

  it('zet de langst stilstaande bovenaan', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'kort' }), dossier({ id: 'lang' })],
      laatsteBeweging: {
        kort: '2026-08-25T12:00:00.000Z',
        lang: '2026-07-01T12:00:00.000Z',
      },
    }))
    expect(r.stilstaand.map(s => s.dossier_id)).toEqual(['lang', 'kort'])
  })

  it('kijkt niet naar gesloten offertes', () => {
    const r = berekenCommercieCijfers(invoer({
      dossiers: [dossier({ id: 'a', offerte_substatus: 'verloren', verzonden_op: '2026-01-01T00:00:00.000Z' })],
    }))
    expect(r.stilstaand).toEqual([])
  })
})
