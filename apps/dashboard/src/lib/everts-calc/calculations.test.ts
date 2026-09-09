import { describe, it, expect } from 'vitest'
import {
  berekenCalculatieregel,
  berekenBtwBreakdown,
  berekenLijnTotaal,
  parseGetal,
  formatEuro,
} from './calculations'
import type { Calculatieregel, Componentregel } from './types'

/**
 * Tests op de rekenkern.
 *
 * WAAROM DEZE ALS EERSTE: dit is de goedkoopste plek om te beginnen. `calculations.ts` is
 * 464 regels puur rekenwerk -- geen database, geen React, geen netwerk -- en het is
 * tegelijk het hart van elke offerte. Eén fout hier komt als verkeerd bedrag bij een klant
 * op de mat.
 *
 * WAT DEZE TESTS ZIJN: ze leggen vast wat de code vandaag *doet*, niet wat hij zou moeten
 * doen. Bij een refactor is een afwijking dus een regressie, niet een verbetering. Dat is
 * precies het vangnet dat ontbrak: er stond nul test op 242.000 regels.
 *
 * De gevallen hieronder zijn niet verzonnen. Elk randgeval komt uit een commentaarregel in
 * `calculations.ts` waar iemand de bug al eens heeft opgelost -- die wil je vastnagelen.
 */

const regel = (over: Partial<Calculatieregel> = {}): Calculatieregel => ({
  id: 'r1',
  groep_id: 'g1',
  omschrijving: 'Testregel',
  hoeveelheid: 10,
  eenheid: 'm²' as Calculatieregel['eenheid'],
  volgorde: 1,
  ...over,
})

const comp = (over: Partial<Componentregel> = {}): Componentregel => ({
  id: 'c1',
  calculatieregel_id: 'r1',
  type: 'arbeid',
  norm_hoeveelheid: 0.5,
  tarief: 40,
  ...over,
})

describe('berekenCalculatieregel', () => {
  it('rekent arbeid, materieel en onderaanneming per eenheid en als totaal', () => {
    const b = berekenCalculatieregel(regel(), [
      comp({ id: 'a', type: 'arbeid', norm_hoeveelheid: 0.5, tarief: 40 }),
      comp({ id: 'm', type: 'materieel', norm_hoeveelheid: 2, tarief: 3 }),
      comp({ id: 'o', type: 'onderaanneming', norm_hoeveelheid: 1, tarief: 7 }),
    ])

    expect(b.arbeid_pe).toBe(20)      // 0,5 uur × € 40
    expect(b.materieel_pe).toBe(6)    // 2 × € 3
    expect(b.oa_pe).toBe(7)
    expect(b.kp_pe).toBe(33)
    expect(b.kp_totaal).toBe(330)     // × 10 m²
    expect(b.uren_pe).toBe(0.5)
    expect(b.uren_totaal).toBe(5)
    expect(b.min_pe).toBe(30)
  })

  it('past de opslag per component toe, met de regel-opslag als terugval', () => {
    const b = berekenCalculatieregel(
      regel({ hoeveelheid: 1 }),
      [
        comp({ id: 'a', type: 'arbeid', norm_hoeveelheid: 1, tarief: 100 }),            // geen eigen opslag
        comp({ id: 'm', type: 'materieel', norm_hoeveelheid: 1, tarief: 100, opslag_pct: 50 }),
      ],
      10, // regel-opslag
    )

    // toBeCloseTo en niet toBe: de opslagberekening werkt met drijvende komma en levert
    // hier 110.00000000000001. Dat is geen fout -- er wordt op dit niveau bewust niet
    // afgerond, dat gebeurt pas bij het tonen -- maar een test die exacte gelijkheid eist
    // zou bij elke onschuldige herschikking van de formule omvallen.
    expect(b.arbeid_vp).toBeCloseTo(110, 10)   // terugval op 10%
    expect(b.materieel_vp).toBeCloseTo(150, 10) // eigen 50% wint
    expect(b.vp_totaal).toBeCloseTo(260, 10)
  })

  it('geeft een tekstregel nooit een bedrag, ook niet met componenten eronder', () => {
    // Uit de code: een post die naar tekst is omgezet kan nog componenten hebben hangen.
    const b = berekenCalculatieregel(
      regel({ soort: 'tekst' as Calculatieregel['soort'] }),
      [comp({ norm_hoeveelheid: 100, tarief: 100 })],
    )

    expect(b.kp_totaal).toBe(0)
    expect(b.vp_totaal).toBe(0)
    expect(b.uren_totaal).toBe(0)
  })

  it('houdt de verkoopprijs per eenheid overeind bij een negatieve hoeveelheid', () => {
    // Deze is met schade en schande geleerd: met `> 0` in plaats van `!== 0` viel vp_pe op
    // nul, nam de offerte-import een minderwerkregel over voor € 0,00 en klopte het
    // offertetotaal niet meer. Dat mag nooit stilletjes terugkomen.
    const b = berekenCalculatieregel(regel({ hoeveelheid: -1 }), [
      comp({ norm_hoeveelheid: 1, tarief: 250 }),
    ])

    expect(b.vp_totaal).toBe(-250)
    expect(b.vp_pe).toBe(250)
  })

  it('deelt niet door nul bij hoeveelheid 0', () => {
    const b = berekenCalculatieregel(regel({ hoeveelheid: 0 }), [comp()])
    expect(b.vp_pe).toBe(0)
    expect(Number.isNaN(b.vp_pe)).toBe(false)
  })
})

describe('parseGetal', () => {
  it('leest de Nederlandse schrijfwijze', () => {
    expect(parseGetal('1.234,56')).toBe(1234.56)
    expect(parseGetal('12,5')).toBe(12.5)
  })

  it('geeft 0 bij onzin in plaats van NaN', () => {
    // Een NaN die door de berekening lekt maakt een heel offertetotaal leeg.
    expect(parseGetal('')).toBe(0)
    expect(parseGetal('abc')).toBe(0)
  })
})

describe('berekenLijnTotaal', () => {
  it('rekent hoeveelheid × eenheidsprijs × verliesfactor', () => {
    const lijn = { hoeveelheid: 3, eenheidsprijs: 12.5, verliesfactor: 1.1 }
    expect(berekenLijnTotaal(lijn as Parameters<typeof berekenLijnTotaal>[0])).toBeCloseTo(41.25, 10)
  })

  it('laat de verliesfactor het totaal echt beïnvloeden', () => {
    const zonder = { hoeveelheid: 10, eenheidsprijs: 10, verliesfactor: 1 }
    const met = { hoeveelheid: 10, eenheidsprijs: 10, verliesfactor: 1.1 }
    type L = Parameters<typeof berekenLijnTotaal>[0]
    expect(berekenLijnTotaal(met as L) - berekenLijnTotaal(zonder as L)).toBeCloseTo(10, 10)
  })
})

describe('formatEuro', () => {
  it('houdt de opmaak stabiel', () => {
    // Deze uitvoer belandt in offertes en PDF's; verandert hij, dan verandert het document.
    const uit = formatEuro(1234.5)
    expect(uit).toContain('234')
    expect(uit.startsWith('€')).toBe(true)
  })
})

describe('berekenBtwBreakdown', () => {
  const eenComp = (regelId: string, tarief: number): Componentregel =>
    comp({ id: `c-${regelId}`, calculatieregel_id: regelId, norm_hoeveelheid: 1, tarief })

  it('telt regels met hetzelfde tarief bij elkaar op en sorteert op percentage', () => {
    const regels = [
      regel({ id: 'r1', hoeveelheid: 1, btw_pct: 21, btw_tarief_id: 't21' }),
      regel({ id: 'r2', hoeveelheid: 1, btw_pct: 21, btw_tarief_id: 't21' }),
      regel({ id: 'r3', hoeveelheid: 1, btw_pct: 9, btw_tarief_id: 't9' }),
    ]
    const componenten = [eenComp('r1', 1000), eenComp('r2', 500), eenComp('r3', 200)]

    const uit = berekenBtwBreakdown(regels, componenten, 0, 21)

    expect(uit).toHaveLength(2)
    expect(uit[0].pct).toBe(9)          // gesorteerd op percentage
    expect(uit[0].basis).toBe(200)
    expect(uit[1].pct).toBe(21)
    expect(uit[1].basis).toBe(1500)     // 1000 + 500 opgeteld
    expect(uit[1].btw).toBe(315)        // 21% over 1500
  })

  it('houdt twee tarieven die allebei 0% heffen uit elkaar', () => {
    // Dit is de regel die de code expliciet noemt: "Verlegd Hoog 21%" en "Geen" heffen
    // allebei niets, maar horen los op de offerte. Groeperen op percentage alleen zou ze
    // samenvoegen en de offerte onjuist maken.
    const regels = [
      regel({ id: 'r1', hoeveelheid: 1, btw_pct: 0, btw_tarief_id: 'verlegd-hoog' }),
      regel({ id: 'r2', hoeveelheid: 1, btw_pct: 0, btw_tarief_id: 'geen' }),
    ]
    const componenten = [eenComp('r1', 100), eenComp('r2', 200)]
    const tarieven = [
      { id: 'verlegd-hoog', label: 'Verlegd Hoog 21%', percentage: 0, verlegd: true },
      { id: 'geen', label: 'Geen', percentage: 0, verlegd: false },
    ]

    const uit = berekenBtwBreakdown(regels, componenten, 0, 0, tarieven)

    expect(uit).toHaveLength(2)
    expect(uit.map(g => g.label).sort()).toEqual(['Geen', 'Verlegd Hoog 21%'])
    // Bij verlegging leidt het nominale percentage uit het label; dat is wat er op de
    // offerte hoort te staan, ook al wordt er niets geheven.
    expect(uit.find(g => g.verlegd)?.nominaal_pct).toBe(21)
  })

  it('slaat regels zonder bedrag over', () => {
    const regels = [
      regel({ id: 'r1', hoeveelheid: 1, btw_pct: 21 }),
      regel({ id: 'r2', soort: 'tekst' as Calculatieregel['soort'], btw_pct: 21 }),
    ]
    const uit = berekenBtwBreakdown(regels, [eenComp('r1', 100)], 0, 21)
    expect(uit).toHaveLength(1)
    expect(uit[0].basis).toBe(100)
  })
})
