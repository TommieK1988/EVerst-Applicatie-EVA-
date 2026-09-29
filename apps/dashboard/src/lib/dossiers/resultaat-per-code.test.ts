import { describe, expect, it } from 'vitest'
import {
  berekenResultaatPerCode, doorgerekendeVerkoop,
  type MeerwerkInvoer, type ResultaatInvoer, type StelpostInvoer,
} from './resultaat-per-code'

const basis = (over: Partial<ResultaatInvoer> = {}): ResultaatInvoer => ({
  codes: [], stelposten: [], meerwerk: [], regieCode: null,
  verkoopPerCode: new Map(), inkoopPerCode: new Map(),
  aanneemsomBasis: null, standaardOpslagPct: 25,
  ...over,
})

const stelpost = (over: Partial<StelpostInvoer>): StelpostInvoer => ({
  bewakingscode: 'SP01', omschrijving: 'Stelpost', bedrag_excl_btw: 1000, in_opdracht: true,
  grondslag: 'vast', eenheidsprijs: null, hoeveelheid_werkelijk: null, opslag_pct: null,
  ...over,
})

const meerwerk = (over: Partial<MeerwerkInvoer>): MeerwerkInvoer => ({
  bewakingscode: 'MW01', omschrijving: 'Meerwerk', status: 'akkoord', afrekenwijze: 'aangenomen',
  is_stelpost: false, stelpost_grondslag: null, bedrag_excl_btw: 500, eenheidsprijs: null,
  hoeveelheid_werkelijk: null, mandaat_excl_btw: null, opdracht_onderdeel_id: null,
  ...over,
})

describe('doorgerekendeVerkoop', () => {
  it('rekent de nog te verwachten kosten door tegen de werkelijke verkoop/kosten-verhouding', () => {
    // 1000 kosten geboekt, 1500 verkoop → factor 1,5; nog 400 te verwachten → +600.
    expect(doorgerekendeVerkoop({ geboekteVerkoop: 1500, geboekteInkoop: 1000, prognose: 1400, geboekt: 1000, opslagPct: 25 }))
      .toBe(2100)
  })

  it('valt zonder boekingen terug op 1 + opslag', () => {
    expect(doorgerekendeVerkoop({ geboekteVerkoop: 0, geboekteInkoop: 0, prognose: 800, geboekt: 0, opslagPct: 25 }))
      .toBe(1000)
  })

  it('rekent niets extra door als er al boven de prognose geboekt is', () => {
    expect(doorgerekendeVerkoop({ geboekteVerkoop: 1300, geboekteInkoop: 1000, prognose: 900, geboekt: 1000, opslagPct: 25 }))
      .toBe(1300)
  })
})

describe('berekenResultaatPerCode', () => {
  it('zet een vaste stelpost af tegen de hoogste van prognose en geboekt', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'SP01', naam: 'Stelpost', prognose: 700, geboekt: 850 }],
      stelposten: [stelpost({})],
    }))
    expect(r.regels).toHaveLength(1)
    expect(r.regels[0]).toMatchObject({ code: 'SP01', verkoop: 1000, kosten: 850, resultaat: 150, margePct: 15 })
  })

  it('rekent een eenheidsprijs-stelpost op de werkelijke hoeveelheid, en anders op het stelpostbedrag', () => {
    const met = berekenResultaatPerCode(basis({
      stelposten: [stelpost({ grondslag: 'eenheidsprijzen', eenheidsprijs: 50, hoeveelheid_werkelijk: 30 })],
    }))
    expect(met.regels[0]).toMatchObject({ verkoop: 1500, grondslag: 'eenheidsprijs' })

    const zonder = berekenResultaatPerCode(basis({
      stelposten: [stelpost({ grondslag: 'eenheidsprijzen', eenheidsprijs: 50, hoeveelheid_werkelijk: null })],
    }))
    expect(zonder.regels[0]).toMatchObject({ verkoop: 1000, grondslag: 'vast' })
  })

  it('laat een stelpost op geboekte kosten ook onder het stelpostbedrag uitkomen (minderwerk)', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'SP01', naam: null, prognose: 400, geboekt: 400 }],
      stelposten: [stelpost({ grondslag: 'geboekte_kosten' })],
      verkoopPerCode: new Map([['SP01', 500]]),
      inkoopPerCode: new Map([['SP01', 400]]),
    }))
    expect(r.regels[0]).toMatchObject({ verkoop: 500, grondslag: 'doorgerekend', resultaat: 100 })
  })

  it('houdt het stelpostbedrag aan zolang er op de code nog niets staat', () => {
    const r = berekenResultaatPerCode(basis({ stelposten: [stelpost({ grondslag: 'geboekte_kosten' })] }))
    expect(r.regels[0]).toMatchObject({ verkoop: 1000, grondslag: 'vast' })
  })

  it('gebruikt het mandaat als ondergrens bij regie-meerwerk', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'MW01', naam: null, prognose: 200, geboekt: 100 }],
      meerwerk: [meerwerk({ afrekenwijze: 'regie', mandaat_excl_btw: 2000 })],
      verkoopPerCode: new Map([['MW01', 125]]),
      inkoopPerCode: new Map([['MW01', 100]]),
    }))
    expect(r.regels[0]).toMatchObject({ verkoop: 2000, grondslag: 'mandaat' })
  })

  it('telt meerwerk alleen na akkoord, en een stelpostverrekening niet dubbel', () => {
    const r = berekenResultaatPerCode(basis({
      meerwerk: [
        meerwerk({ status: 'aangevraagd' }),
        meerwerk({ bewakingscode: 'SP01', opdracht_onderdeel_id: 'x', bedrag_excl_btw: 300 }),
        meerwerk({ bedrag_excl_btw: 500 }),
      ],
    }))
    expect(r.regels.map(x => [x.code, x.verkoop])).toEqual([['MW01', 500]])
  })

  it('zet de overige codes tegen de aanneemsom, zodat het totaal het projectresultaat is', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [
        { code: 'SP01', naam: null, prognose: 800, geboekt: 0 },
        { code: 'WERK', naam: null, prognose: 7000, geboekt: 3000 },
        { code: '-', naam: 'Kosten zonder bewaking', prognose: 0, geboekt: 200 },
      ],
      stelposten: [stelpost({}), stelpost({ bewakingscode: null, bedrag_excl_btw: 400 })],
      meerwerk: [meerwerk({ bewakingscode: null, bedrag_excl_btw: 600 })],
      aanneemsomBasis: 9000,
    }))
    const overig = r.regels.find(x => x.soort === 'aanneemsom')!
    // 9000 basis + 400 stelpost zonder code + 600 meerwerk zonder code.
    expect(overig).toMatchObject({ verkoop: 10000, kosten: 7200, geboekteKosten: 3200, resultaat: 2800 })
    expect(r.meerwerkZonderCode).toBe(600)
    expect(r.totaal).toMatchObject({ verkoop: 11000, kosten: 8000, resultaat: 3000 })
  })

  it('zet meerwerk zonder eigen code onder de gekoppelde kostencode', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'HR.A', naam: 'Houtrot', prognose: 1800, geboekt: 1500, begroot: 0, meerwerk: 2000 }],
      meerwerk: [
        meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', bedrag_excl_btw: 1500 }),
        meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', bedrag_excl_btw: 1000 }),
      ],
      aanneemsomBasis: 5000,
    }))
    expect(r.meerwerkZonderCode).toBe(0)
    expect(r.regels.find(x => x.code === 'HR.A')).toMatchObject({
      soort: 'meerwerk', naam: 'Houtrot', verkoop: 2500, kosten: 1800, resultaat: 700, kostenAandeel: null,
    })
    // De code zit niet meer in de verzamelregel.
    expect(r.regels.find(x => x.soort === 'aanneemsom')).toMatchObject({ verkoop: 5000, kosten: 0 })
  })

  it('verdeelt een code met aanneemsom- én meerwerkbudget naar verhouding', () => {
    const r = berekenResultaatPerCode(basis({
      // 3000 begroot + 1000 meerwerk → een kwart van de kosten is meerwerk.
      codes: [{ code: 'GEVEL.A', naam: null, prognose: 4000, geboekt: 2000, begroot: 3000, meerwerk: 1000 }],
      meerwerk: [meerwerk({ bewakingscode: null, kosten_bewakingscode: 'GEVEL.A', bedrag_excl_btw: 1400 })],
      aanneemsomBasis: 3600,
    }))
    expect(r.regels.find(x => x.code === 'GEVEL.A')).toMatchObject({
      kosten: 1000, geboekteKosten: 500, resultaat: 400, kostenAandeel: 0.25,
    })
    expect(r.regels.find(x => x.soort === 'aanneemsom')).toMatchObject({ kosten: 3000, geboekteKosten: 1500, resultaat: 600 })
    expect(r.totaal).toMatchObject({ verkoop: 5000, kosten: 4000, resultaat: 1000 })
  })

  it('rekent gekoppeld regiemeerwerk niet door op de kosten van die code', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'HR.A', naam: null, prognose: 900, geboekt: 900 }],
      meerwerk: [meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', afrekenwijze: 'regie', mandaat_excl_btw: 1200 })],
      verkoopPerCode: new Map([['HR.A', 5000]]),
      inkoopPerCode: new Map([['HR.A', 4000]]),
    }))
    expect(r.regels.find(x => x.code === 'HR.A')).toMatchObject({ verkoop: 1200, grondslag: 'mandaat' })
  })

  it('laat de aanneemsomregel weg op een regiebon', () => {
    const r = berekenResultaatPerCode(basis({
      codes: [{ code: 'RW01', naam: 'Regie', prognose: 1000, geboekt: 1000 }],
      regieCode: 'RW01',
      verkoopPerCode: new Map([['RW01', 1400]]),
      inkoopPerCode: new Map([['RW01', 1000]]),
    }))
    expect(r.regels).toHaveLength(1)
    expect(r.regels[0]).toMatchObject({ soort: 'regie', verkoop: 1400, resultaat: 400 })
  })
})
