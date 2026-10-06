import { describe, expect, it } from 'vitest'
import {
  berekenResultaatPerPost, doorgerekendeVerkoop,
  type MeerwerkInvoer, type ResultaatInvoer, type StelpostInvoer,
} from './resultaat-per-code'

const basis = (over: Partial<ResultaatInvoer> = {}): ResultaatInvoer => ({
  codes: [], stelposten: [], meerwerk: [], regieCode: null,
  verkoopPerCode: new Map(), inkoopPerCode: new Map(),
  aanneemsomBasis: null, standaardOpslagPct: 25,
  ...over,
})

let volg = 0
const stelpost = (over: Partial<StelpostInvoer>): StelpostInvoer => ({
  id: `sp${++volg}`, bewakingscode: 'SP01', omschrijving: 'Stelpost', bedrag_excl_btw: 1000, in_opdracht: true,
  in_aanneemsom: true, grondslag: 'vast', eenheidsprijs: null, hoeveelheid_werkelijk: null, opslag_pct: null,
  ...over,
})

const meerwerk = (over: Partial<MeerwerkInvoer>): MeerwerkInvoer => ({
  id: `mw${++volg}`, bewakingscode: 'MW01', omschrijving: 'Meerwerk', status: 'akkoord', afrekenwijze: 'aangenomen',
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

describe('berekenResultaatPerPost', () => {
  it('zet een vaste stelpost af tegen de prognose, ook als er al meer geboekt is', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'SP01', naam: 'Stelpost', prognose: 700, geboekt: 850 }],
      stelposten: [stelpost({})],
    }))
    expect(r.aanneemsom.stelposten).toHaveLength(1)
    expect(r.aanneemsom.stelposten[0]).toMatchObject({ code: 'SP01', verkoop: 1000, prognose: 700, resultaat: 300, margePct: 30 })
  })

  it('rekent een eenheidsprijs-stelpost op de werkelijke hoeveelheid, en anders op het stelpostbedrag', () => {
    const met = berekenResultaatPerPost(basis({
      stelposten: [stelpost({ grondslag: 'eenheidsprijzen', eenheidsprijs: 50, hoeveelheid_werkelijk: 30 })],
    }))
    expect(met.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 1500, grondslag: 'eenheidsprijs' })

    const zonder = berekenResultaatPerPost(basis({
      stelposten: [stelpost({ grondslag: 'eenheidsprijzen', eenheidsprijs: 50, hoeveelheid_werkelijk: null })],
    }))
    expect(zonder.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 1000, grondslag: 'vast' })
  })

  it('houdt bij een stelpost op geboekte kosten het stelpostbedrag aan, niet werkbegroting × opslag', () => {
    // Complex 1027: stelpost € 196.074, werkbegroting € 59.420, niets geboekt.
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'SP01', naam: null, prognose: 59420, geboekt: 0 }],
      stelposten: [stelpost({ grondslag: 'geboekte_kosten', bedrag_excl_btw: 196073.55 })],
    }))
    expect(r.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 196073.55, grondslag: 'vast', prognose: 59420 })
  })

  it('neemt de geboekte verkoopwaarde als die al boven het stelpostbedrag ligt', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'SP01', naam: null, prognose: 800, geboekt: 900 }],
      stelposten: [stelpost({ grondslag: 'geboekte_kosten' })],
      verkoopPerCode: new Map([['SP01', 1125]]),
    }))
    expect(r.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 1125, grondslag: 'geboekt' })
  })

  it('telt een verrekening bij de stelpost op, ook als die minderwerk is', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'SP01', naam: null, prognose: 400, geboekt: 400 }],
      stelposten: [stelpost({ id: 'sp-x', grondslag: 'geboekte_kosten' })],
      meerwerk: [meerwerk({ bewakingscode: 'SP01', opdracht_onderdeel_id: 'sp-x', bedrag_excl_btw: -500 })],
    }))
    expect(r.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 500, grondslag: 'verrekend' })
    expect(r.meerwerk.posten).toHaveLength(0)
  })

  it('zet een aanvullende stelpost onder het meerwerk, en een stelpost in de aanneemsom eronder', () => {
    const r = berekenResultaatPerPost(basis({
      stelposten: [stelpost({ omschrijving: 'Erin' }), stelpost({ omschrijving: 'Aanvullend', bewakingscode: 'SP02', in_aanneemsom: false })],
      aanneemsomBasis: 5000,
    }))
    expect(r.aanneemsom.stelposten.map(p => p.omschrijving)).toEqual(['Erin'])
    expect(r.meerwerk.posten.map(p => [p.omschrijving, p.soort])).toEqual([['Aanvullend', 'stelpost']])
  })

  it('gebruikt het mandaat als ondergrens bij regie-meerwerk', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'MW01', naam: null, prognose: 200, geboekt: 100 }],
      meerwerk: [meerwerk({ afrekenwijze: 'regie', mandaat_excl_btw: 2000 })],
      verkoopPerCode: new Map([['MW01', 125]]),
      inkoopPerCode: new Map([['MW01', 100]]),
    }))
    expect(r.meerwerk.posten[0]).toMatchObject({ verkoop: 2000, grondslag: 'mandaat' })
  })

  it('telt meerwerk alleen na akkoord, en een stelpostverrekening niet dubbel', () => {
    const r = berekenResultaatPerPost(basis({
      meerwerk: [
        meerwerk({ status: 'aangevraagd' }),
        meerwerk({ bewakingscode: 'SP01', opdracht_onderdeel_id: 'x', bedrag_excl_btw: 300 }),
        meerwerk({ bedrag_excl_btw: 500 }),
      ],
    }))
    expect(r.meerwerk.posten.map(x => [x.code, x.verkoop])).toEqual([['MW01', 500]])
  })

  it('toont elke meerwerkregel apart en verdeelt de kosten van een gedeelde code naar verkoop', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'MW01', naam: null, prognose: 1000, geboekt: 0 }],
      meerwerk: [meerwerk({ bedrag_excl_btw: 1500 }), meerwerk({ bedrag_excl_btw: 500 })],
    }))
    expect(r.meerwerk.posten.map(p => [p.verkoop, p.prognose, p.kostenAandeel])).toEqual([[1500, 750, 0.75], [500, 250, 0.25]])
    expect(r.meerwerk.subtotaal).toMatchObject({ verkoop: 2000, prognose: 1000, resultaat: 1000, margePct: 50 })
  })

  it('geeft meerwerk zonder code geen prognose; de kosten blijven bij de hoofdaanneemsom', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [
        { code: 'WERK', naam: null, prognose: 7000, geboekt: 3000 },
        { code: '-', naam: 'Kosten zonder bewaking', prognose: 0, geboekt: 200 },
      ],
      meerwerk: [meerwerk({ bewakingscode: null, bedrag_excl_btw: 600 }), meerwerk({ bedrag_excl_btw: 400 })],
      aanneemsomBasis: 9000,
    }))
    expect(r.aanneemsom.hoofd).toMatchObject({ verkoop: 9000, prognose: 7000, resultaat: 2000 })
    expect(r.meerwerk.posten[0]).toMatchObject({ verkoop: 600, prognose: null, resultaat: null, margePct: null })
    // Subtotaal: verkoop van alles, resultaat alleen over MW01 (400 verkoop, 0 kosten).
    expect(r.meerwerk.subtotaal).toMatchObject({ verkoop: 1000, prognose: 0, resultaat: 400, margePct: 100, zonderPrognose: 1 })
    // Totaal = alle verkoop − alle kosten.
    expect(r.totaal).toMatchObject({ verkoop: 10000, prognose: 7000, resultaat: 3000 })
  })

  it('geeft een stelpost zonder code een eigen regel zonder prognose', () => {
    const r = berekenResultaatPerPost(basis({
      stelposten: [stelpost({ bewakingscode: null, bedrag_excl_btw: 400 })],
      aanneemsomBasis: 5000,
    }))
    expect(r.aanneemsom.hoofd).toMatchObject({ verkoop: 5000 })
    expect(r.aanneemsom.stelposten[0]).toMatchObject({ verkoop: 400, prognose: null })
    expect(r.aanneemsom.subtotaal).toMatchObject({ verkoop: 5400, zonderPrognose: 1 })
  })

  it('zet meerwerk zonder eigen code onder de gekoppelde kostencode', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'HR.A', naam: 'Houtrot', prognose: 1800, geboekt: 1500, begroot: 0, meerwerk: 2000 }],
      meerwerk: [
        meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', bedrag_excl_btw: 1500 }),
        meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', bedrag_excl_btw: 1000 }),
      ],
      aanneemsomBasis: 5000,
    }))
    expect(r.meerwerk.posten.map(p => [p.code, p.prognose])).toEqual([['HR.A', 1080], ['HR.A', 720]])
    expect(r.meerwerk.subtotaal).toMatchObject({ verkoop: 2500, prognose: 1800, resultaat: 700 })
    // De code zit niet meer bij de hoofdaanneemsom.
    expect(r.aanneemsom.hoofd).toMatchObject({ verkoop: 5000, prognose: 0 })
  })

  it('verdeelt een code met aanneemsom- én meerwerkbudget naar verhouding', () => {
    const r = berekenResultaatPerPost(basis({
      // 3000 begroot + 1000 meerwerk → een kwart van de kosten is meerwerk.
      codes: [{ code: 'GEVEL.A', naam: null, prognose: 4000, geboekt: 2000, begroot: 3000, meerwerk: 1000 }],
      meerwerk: [meerwerk({ bewakingscode: null, kosten_bewakingscode: 'GEVEL.A', bedrag_excl_btw: 1400 })],
      aanneemsomBasis: 3600,
    }))
    expect(r.meerwerk.posten[0]).toMatchObject({ prognose: 1000, resultaat: 400, kostenAandeel: 0.25 })
    expect(r.aanneemsom.hoofd).toMatchObject({ prognose: 3000, resultaat: 600 })
    expect(r.totaal).toMatchObject({ verkoop: 5000, prognose: 4000, resultaat: 1000 })
  })

  it('rekent gekoppeld regiemeerwerk niet door op de kosten van die code', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'HR.A', naam: null, prognose: 900, geboekt: 900 }],
      meerwerk: [meerwerk({ bewakingscode: null, kosten_bewakingscode: 'HR.A', afrekenwijze: 'regie', bedrag_excl_btw: null, mandaat_excl_btw: 1200 })],
      verkoopPerCode: new Map([['HR.A', 5000]]),
      inkoopPerCode: new Map([['HR.A', 4000]]),
    }))
    expect(r.meerwerk.posten[0]).toMatchObject({ verkoop: 1200, grondslag: 'mandaat' })
  })

  it('rekent een negatieve prognose (minderwerk) gewoon mee', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'WERK', naam: null, prognose: 30000, geboekt: 0 }, { code: 'MW13', naam: null, prognose: -2000, geboekt: 0 }],
      aanneemsomBasis: 50000,
    }))
    expect(r.aanneemsom.hoofd).toMatchObject({ prognose: 28000, resultaat: 22000 })
  })

  it('rekent op geboekte kosten door tot de prognose', () => {
    const r = berekenResultaatPerPost(basis({
      // 1000 besteed, prognose 2000 → nog 1000 × factor 1,5 te gaan.
      codes: [{ code: 'MW01', naam: null, prognose: 2000, geboekt: 1000 }],
      meerwerk: [meerwerk({ afrekenwijze: 'regie' })],
      verkoopPerCode: new Map([['MW01', 1500]]),
      inkoopPerCode: new Map([['MW01', 1000]]),
    }))
    expect(r.meerwerk.posten[0]).toMatchObject({ verkoop: 3000, prognose: 2000 })
  })

  it('zet gekozen opties en regiemeerwerk zonder code als eigen regel', () => {
    const r = berekenResultaatPerPost(basis({
      meerwerk: [meerwerk({ bewakingscode: null, afrekenwijze: 'regie', bedrag_excl_btw: 800 })],
      opties: [{ id: 'o1', omschrijving: 'Extra kleur', bedrag_excl_btw: 1500 }],
      aanneemsomBasis: 10000,
    }))
    expect(r.aanneemsom.opties[0]).toMatchObject({ verkoop: 1500, prognose: null })
    expect(r.aanneemsom.subtotaal.verkoop).toBe(11500)
    expect(r.meerwerk.posten[0]).toMatchObject({ verkoop: 800, grondslag: 'vast' })
    expect(r.totaal.verkoop).toBe(12300)
  })

  it('laat de hoofdaanneemsom weg op een regiebon', () => {
    const r = berekenResultaatPerPost(basis({
      codes: [{ code: 'RW01', naam: 'Regie', prognose: 1000, geboekt: 1000 }],
      regieCode: 'RW01',
      verkoopPerCode: new Map([['RW01', 1400]]),
      inkoopPerCode: new Map([['RW01', 1000]]),
    }))
    expect(r.aanneemsom.hoofd).toBeNull()
    expect(r.aanneemsom.regie).toMatchObject({ verkoop: 1400, resultaat: 400 })
  })

  describe('koppeling aan de Hoofdopdracht', () => {
    const invoer = (gekoppeld?: Set<string>) => basis({
      codes: [
        { code: 'Schilderwerk', naam: 'Schilderwerk', hoofdstuk: 'WERKZAAMHEDEN', prognose: 135360.004, geboekt: 0 },
        { code: 'KK.A', naam: 'Bereikbaarheid', hoofdstuk: 'ALGEMEEN', prognose: 34800.333, geboekt: 0 },
        { code: 'CO01', naam: 'Correcties', hoofdstuk: null, prognose: -12600, geboekt: 0 },
        { code: 'LEEG', naam: null, hoofdstuk: 'ALGEMEEN', prognose: 0, geboekt: 0 },
        { code: 'SP01', naam: 'Houtwerk', hoofdstuk: 'STELPOSTEN', prognose: 59420, geboekt: 0 },
        // Gedeelde code: een kwart is meerwerk, driekwart hoort bij de hoofdopdracht.
        { code: 'GEVEL.A', naam: null, hoofdstuk: 'WERKZAAMHEDEN', prognose: 4000, geboekt: 0, begroot: 3000, meerwerk: 1000 },
      ],
      stelposten: [stelpost({ id: 'sp-vast', bewakingscode: 'SP01', bedrag_excl_btw: 196073.55 })],
      meerwerk: [meerwerk({ id: 'mw-vast', bewakingscode: null, kosten_bewakingscode: 'GEVEL.A', bedrag_excl_btw: 1400 })],
      aanneemsomBasis: 196739,
      gekoppeld,
    })

    it('verandert geen enkel bedrag', () => {
      const zonder = berekenResultaatPerPost(invoer())
      const met = berekenResultaatPerPost(invoer(new Set(['Schilderwerk', 'GEVEL.A'])))
      const bedragen = (r: typeof zonder) => ({
        hoofd: { ...r.aanneemsom.hoofd, onderdelen: undefined },
        stelposten: r.aanneemsom.stelposten, sub: r.aanneemsom.subtotaal, subStp: r.aanneemsom.subtotaalStelposten,
        meerwerk: r.meerwerk, totaal: r.totaal,
      })
      expect(bedragen(met)).toEqual(bedragen(zonder))
    })

    it('de onderdelen tellen exact op tot de prognose van de Hoofdopdracht', () => {
      for (const g of [undefined, new Set(['KK.A']), new Set(['Schilderwerk', 'KK.A', 'CO01', 'GEVEL.A'])]) {
        const h = berekenResultaatPerPost(invoer(g)).aanneemsom.hoofd!
        const som = h.onderdelen!.reduce((s, o) => s + o.prognose, 0)
        expect(Math.round(som * 100) / 100).toBe(h.prognose)
      }
    })

    it('neemt alleen codes zonder eigen post op, met het aanneemsomdeel van een gedeelde code', () => {
      const h = berekenResultaatPerPost(invoer()).aanneemsom.hoofd!
      expect(h.onderdelen!.map(o => o.code).sort()).toEqual(['CO01', 'GEVEL.A', 'KK.A', 'Schilderwerk'])
      expect(h.onderdelen!.find(o => o.code === 'GEVEL.A')!.prognose).toBe(3000)
    })

    it('zet gekoppelde codes eerst, per hoofdstuk, en laat een lege ongekoppelde code weg', () => {
      const h = berekenResultaatPerPost(invoer(new Set(['KK.A', 'Schilderwerk', 'LEEG']))).aanneemsom.hoofd!
      expect(h.onderdelen!.map(o => [o.code, o.gekoppeld])).toEqual([
        ['KK.A', true], ['LEEG', true], ['Schilderwerk', true], ['GEVEL.A', false], ['CO01', false],
      ])
      expect(h.omschrijving).toBe('Hoofdopdracht')
    })
  })
})
