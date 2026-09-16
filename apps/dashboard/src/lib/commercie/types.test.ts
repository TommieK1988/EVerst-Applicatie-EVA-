import { describe, expect, it } from 'vitest'
import {
  bewakingsStatus, stapOmschrijving, werkdagenVooruit,
  SLAPEND_VANAF_DAGEN, UITKOMSTEN, STATUS_PRESENTATIE,
  type BewakingStatus, type BewakingKaart,
} from './types'

const VANDAAG = '2026-09-16' // woensdag

type Stap = Pick<BewakingKaart, 'stap_soort' | 'stap_datum' | 'wacht_op' | 'stap_tekst'>

function kaart(over: Partial<Stap> = {}): Stap {
  return { stap_soort: null, stap_datum: null, wacht_op: null, stap_tekst: null, ...over }
}

function status(over: Partial<Stap>, afgerond = false): BewakingStatus {
  return bewakingsStatus(kaart(over), { vandaag: VANDAAG, afgerond })
}

describe('bewakingsStatus', () => {
  it('afgerond wint van alles — ook van een verlopen actie', () => {
    const over = { stap_soort: 'actie' as const, stap_datum: '2026-01-01', wacht_op: null }
    expect(status(over, false)).toBe('verlopen')
    expect(status(over, true)).toBe('afgerond')
  })

  it('zonder stap is de kaart nog niet beoordeeld', () => {
    expect(status({})).toBe('ongetrieerd')
    // Half ingevulde rijen (soort zonder datum) mogen niet stil als "op schema" tellen.
    expect(status({ stap_soort: 'actie' })).toBe('ongetrieerd')
    expect(status({ stap_datum: '2026-12-01' })).toBe('ongetrieerd')
  })

  it('een onleesbare datum telt als niet beoordeeld, niet als op schema', () => {
    expect(status({ stap_soort: 'actie', stap_datum: 'geen-datum' })).toBe('ongetrieerd')
  })

  it('verstreken datum is rood — ook een gemiste hercontrole', () => {
    expect(status({ stap_soort: 'actie', stap_datum: '2026-09-15' })).toBe('verlopen')
    expect(status({ stap_soort: 'wachten', stap_datum: '2026-09-15', wacht_op: 'klant' }))
      .toBe('verlopen')
  })

  it('vandaag is blauw, voor beide stapsoorten', () => {
    expect(status({ stap_soort: 'actie', stap_datum: VANDAAG })).toBe('nu')
    expect(status({ stap_soort: 'wachten', stap_datum: VANDAAG, wacht_op: 'klant' })).toBe('nu')
  })

  it('een actie in de toekomst staat op schema', () => {
    expect(status({ stap_soort: 'actie', stap_datum: '2026-09-17' })).toBe('op_schema')
    // Ook een actie ver vooruit blijft "op schema": slapend geldt alleen voor wachten.
    expect(status({ stap_soort: 'actie', stap_datum: '2027-09-17' })).toBe('op_schema')
  })

  it('wachten splitst naar wie aan zet is', () => {
    const d = { stap_soort: 'wachten' as const, stap_datum: '2026-09-20' }
    expect(status({ ...d, wacht_op: 'klant' })).toBe('wacht_klant')
    expect(status({ ...d, wacht_op: 'intern' })).toBe('wacht_intern')
    expect(status({ ...d, wacht_op: 'extern' })).toBe('wacht_extern')
  })

  describe('de slapend-grens', () => {
    // Precies op de grens is nog niet slapend; één dag erover wel.
    const opGrens = '2026-12-15'    // 90 dagen na 16-09-2026
    const overGrens = '2026-12-16'  // 91 dagen

    it('telt de grens zelf nog als wachten', () => {
      expect(status({ stap_soort: 'wachten', stap_datum: opGrens, wacht_op: 'klant' }))
        .toBe('wacht_klant')
    })

    it('slaapt vanaf één dag daarna', () => {
      expect(status({ stap_soort: 'wachten', stap_datum: overGrens, wacht_op: 'klant' }))
        .toBe('slapend')
    })

    it('rekent de grens op de afgesproken 90 dagen', () => {
      const [j, m, d] = VANDAAG.split('-').map(Number)
      const grens = new Date(Date.UTC(j, m - 1, d + SLAPEND_VANAF_DAGEN))
      expect(grens.toISOString().slice(0, 10)).toBe(opGrens)
    })
  })

  it('rekent over de zomertijdgrens heen op kalenderdagen', () => {
    // Zomertijd eindigt 25 oktober 2026. Een actie op 26 oktober is dan nog toekomst,
    // ook al zit er een uur extra in dat etmaal.
    const najaar = { vandaag: '2026-10-24', afgerond: false }
    expect(bewakingsStatus(kaart({ stap_soort: 'actie', stap_datum: '2026-10-26' }), najaar))
      .toBe('op_schema')
    expect(bewakingsStatus(kaart({ stap_soort: 'actie', stap_datum: '2026-10-24' }), najaar))
      .toBe('nu')
    expect(bewakingsStatus(kaart({ stap_soort: 'actie', stap_datum: '2026-10-23' }), najaar))
      .toBe('verlopen')
  })

  it('geeft elke status een presentatie', () => {
    const alle: BewakingStatus[] = [
      'afgerond', 'ongetrieerd', 'verlopen', 'nu', 'op_schema',
      'wacht_klant', 'wacht_intern', 'wacht_extern', 'slapend',
    ]
    for (const s of alle) {
      expect(STATUS_PRESENTATIE[s]?.label, s).toBeTruthy()
      expect(STATUS_PRESENTATIE[s]?.stip, s).toBeTruthy()
    }
  })
})

describe('stapOmschrijving', () => {
  it('zwijgt als er niets is afgesproken', () => {
    expect(stapOmschrijving(kaart())).toBeNull()
  })

  it('noemt bij wachten expliciet tot wanneer — dat voorkomt dubbel nabellen', () => {
    const tekst = stapOmschrijving(kaart({
      stap_soort: 'wachten', stap_datum: '2026-08-28', wacht_op: 'klant',
      stap_tekst: 'Klant zou terugkomen',
    }))
    expect(tekst).toContain('Wachten op klant tot')
    expect(tekst).toContain('28 augustus 2026')
  })

  it('benoemt collega en derde partij apart', () => {
    expect(stapOmschrijving(kaart({
      stap_soort: 'wachten', stap_datum: '2026-08-28', wacht_op: 'intern',
    }))).toContain('collega')
    expect(stapOmschrijving(kaart({
      stap_soort: 'wachten', stap_datum: '2026-08-28', wacht_op: 'extern',
    }))).toContain('derde partij')
  })

  it('zet bij een actie de tekst voorop', () => {
    expect(stapOmschrijving(kaart({
      stap_soort: 'actie', stap_datum: '2026-09-18', stap_tekst: 'Bellen over prijsvraag',
    }))).toBe('Bellen over prijsvraag — 18 september 2026')
  })
})

describe('werkdagenVooruit', () => {
  it('slaat het weekend over', () => {
    // Donderdag 17 sep + 3 werkdagen = dinsdag 22 sep (vr, ma, di).
    expect(werkdagenVooruit('2026-09-17', 3)).toBe('2026-09-22')
  })

  it('landt nooit op een zaterdag of zondag', () => {
    for (let start = 14; start <= 20; start++) {
      for (const dagen of [1, 3, 5, 10]) {
        const iso = werkdagenVooruit(`2026-09-${String(start).padStart(2, '0')}`, dagen)
        const [j, m, d] = iso.split('-').map(Number)
        const dag = new Date(Date.UTC(j, m - 1, d)).getUTCDay()
        expect([0, 6], `${iso} valt in het weekend`).not.toContain(dag)
      }
    }
  })

  it('rekent netjes over een maandgrens', () => {
    // Maandag 28 sep + 5 werkdagen = maandag 5 okt.
    expect(werkdagenVooruit('2026-09-28', 5)).toBe('2026-10-05')
  })
})

describe('UITKOMSTEN', () => {
  it('laat elke uitkomst tot een bewuste vervolgbeweging leiden', () => {
    for (const u of UITKOMSTEN) {
      // Een uitkomst zet óf een stap met een datum, óf sluit de kaart (verloren),
      // óf vraagt de gebruiker zelf om een datum. Stilvallen mag niet.
      const heeftBeweging =
        u.werkdagen != null || u.vraagtDatum === true || u.fase === 'verloren'
      expect(heeftBeweging, `${u.sleutel} laat de kaart stilvallen`).toBe(true)
    }
  })

  it('geeft elke wachtende uitkomst een wacht_op', () => {
    for (const u of UITKOMSTEN) {
      if (u.stapSoort === 'wachten') {
        expect(u.wachtOp, `${u.sleutel} mist wacht_op`).toBeTruthy()
      }
    }
  })

  it('vraagt alleen bij verlies om een reden', () => {
    const metReden = UITKOMSTEN.filter(u => u.vraagtReden)
    expect(metReden.map(u => u.sleutel)).toEqual(['verloren'])
  })

  it('heeft unieke sleutels', () => {
    const sleutels = UITKOMSTEN.map(u => u.sleutel)
    expect(new Set(sleutels).size).toBe(sleutels.length)
  })
})
