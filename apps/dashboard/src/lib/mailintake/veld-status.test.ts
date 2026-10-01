import { describe, expect, it } from 'vitest'
import { faseVoorstelVoor } from '@/components/dossiers/fase-plaatsing'
import { eisenVoor, ALLE_VELDEN, type VeldSleutel } from './veld-eisen'
import {
  beoordeelVeld, beoordeelAlleVelden, ontbrekendeVelden, magAfhandelen,
} from './veld-status'

/**
 * Het behandelscherm toont voortaan alle velden altijd op dezelfde plek; wat per
 * bericht verschilt is alleen de kleur. Die kleur komt uit deze twee modules, en
 * daarmee zijn ze de plek waar het scherm stilletjes kan gaan liegen: een veld dat
 * ten onrechte groen is, houdt niemand tegen.
 *
 * De eisentabel is bovendien precies het soort ding dat bij een latere opruiming
 * "vereenvoudigd" wordt tot één lijst voor alle routes.
 */
describe('eisenVoor: wat betekent een veld voor déze afhandeling', () => {
  it('eist bij een nieuw dossier de acht velden die de knop ook eist', () => {
    const e = eisenVoor('nieuw_dossier', 'offerteaanvraag')
    for (const veld of [
      'klant_naam', 'omschrijving', 'categorie_voorstel', 'werkmaatschappij_voorstel',
      'werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode', 'werkadres_stad',
    ] as VeldSleutel[]) {
      expect(e[veld], veld).toBe('verplicht')
    }
  })

  it('laat bij een opdracht op een offerte het werkadres met rust', () => {
    // Dat staat al op het dossier; leeg op het scherm betekent hier niet "ontbreekt".
    const e = eisenVoor('offerte_winnen', 'opdracht_op_offerte')
    expect(e.werkadres_straat).toBe('nvt')
    expect(e.categorie_voorstel).toBe('nvt')
    expect(e.omschrijving).toBe('nvt')
    expect(e.offerte_dossier).toBe('verplicht')
  })

  it('vraagt een mandaat alleen bij een servicedeskbon', () => {
    expect(eisenVoor('nieuw_dossier', 'servicedeskbon').mandaat_bedrag).toBe('gewenst')
    expect(eisenVoor('nieuw_dossier', 'offerteaanvraag').mandaat_bedrag).toBe('nvt')
  })

  it('vraagt een opdrachtreferentie bij een opdracht, niet bij een aanvraag', () => {
    expect(eisenVoor('nieuw_dossier', 'opdrachtbon').opdracht_referentie).toBe('verplicht')
    expect(eisenVoor('nieuw_dossier', 'offerteaanvraag').opdracht_referentie).toBe('nvt')
  })

  it('laat de route winnen als die een veld buiten beeld zet', () => {
    // opdracht_op_offerte wil een opdrachtreferentie, maar de route bepaalt dat het
    // werkadres niet meespeelt -- de soort haalt dat niet terug.
    const e = eisenVoor('offerte_winnen', 'opdracht_op_offerte')
    expect(e.opdracht_referentie).toBe('verplicht')
    expect(e.werkadres_straat).toBe('nvt')
  })

  it('geeft voor elk bekend veld een uitspraak', () => {
    const e = eisenVoor('nieuw_dossier', 'offerteaanvraag')
    for (const veld of ALLE_VELDEN) expect(e[veld], veld).toBeDefined()
  })
})

/**
 * De fase is de keuze die de behandelaar links maakt. Dat die keuze de velden
 * stuurt is het hele punt: eerder bleven de opdrachtvelden gedimd staan als je van
 * Aanvraag naar Opdracht klikte, en kwamen de termijnen nooit in beeld.
 */
describe('eisenVoor: de gekozen fase stuurt de velden', () => {
  it('laat bij een aanvraag de opdrachtvelden en de termijnen met rust', () => {
    const e = eisenVoor('nieuw_dossier', 'offerteaanvraag', 'aanvraag')
    expect(e.opdracht_referentie).toBe('nvt')
    expect(e.opdrachtdatum).toBe('nvt')
    expect(e.termijnschema).toBe('nvt')
  })

  it('zet ze aan zodra je naar Opdracht klikt', () => {
    const e = eisenVoor('nieuw_dossier', 'offerteaanvraag', 'opdracht')
    expect(e.opdracht_referentie).toBe('gewenst')
    expect(e.opdrachtdatum).toBe('gewenst')
    expect(e.termijnschema).toBe('gewenst')
    expect(e.bedrag_excl_btw).toBe('gewenst')
  })

  it('maakt een veld nooit lichter dan de mailsoort het al maakte', () => {
    // De fase zegt "gewenst", de opdrachtbon zegt "verplicht". Zou de fase domweg
    // winnen, dan zou omklikken naar Opdracht de eis juist versoepelen.
    expect(eisenVoor('nieuw_dossier', 'opdrachtbon', 'opdracht').opdracht_referentie)
      .toBe('verplicht')
  })

  it('mag een veld wel helemaal uitzetten', () => {
    // Wie van een opdrachtbon tóch een aanvraag maakt, zegt daarmee dat er geen
    // opdrachtnummer te verwachten valt. Dan hoort dat veld niet rood te staan.
    expect(eisenVoor('nieuw_dossier', 'opdrachtbon', 'aanvraag').opdracht_referentie)
      .toBe('nvt')
  })

  it('zet het mandaat uit bij een aanvraag en laat het staan bij een opdracht', () => {
    // Er is niets gegund, dus ook geen plafond om binnen te werken.
    expect(eisenVoor('nieuw_dossier', 'servicedeskbon', 'aanvraag').mandaat_bedrag)
      .toBe('nvt')
    // Bij een opdracht wél: een mandaat betekent altijd regie, en dan is dit het
    // veld dat de afrekenwijze verklaart. Gedimd zou het juist verbergen.
    expect(eisenVoor('nieuw_dossier', 'servicedeskbon', 'opdracht').mandaat_bedrag)
      .toBe('gewenst')
    expect(eisenVoor('nieuw_dossier', 'servicedeskbon', 'servicedesk').mandaat_bedrag)
      .toBe('gewenst')
  })

  it('laat de route winnen van de fase', () => {
    // Meerwerk gaat op een opdracht die al loopt; de termijnstaat daarvan staat er
    // al, ook al zegt de fase "opdracht".
    expect(eisenVoor('geen', 'meerwerk', 'opdracht').termijnschema).toBe('nvt')
  })

  it('verandert niets als er geen fase bekend is', () => {
    const zonder = eisenVoor('nieuw_dossier', 'opdrachtbon')
    expect(zonder.opdracht_referentie).toBe('verplicht')
    expect(zonder.mandaat_bedrag).toBe('gewenst')
  })
})

describe('faseVoorstelVoor: wat EVA zelf voorklikt', () => {
  it('zet de gegunde soorten op Opdracht', () => {
    for (const soort of ['opdrachtbon', 'opdracht_op_offerte', 'meerwerk']) {
      expect(faseVoorstelVoor(null, soort), soort).toBe('opdracht')
    }
  })

  it('houdt een offerteaanvraag op Aanvraag', () => {
    expect(faseVoorstelVoor(null, 'offerteaanvraag')).toBe('aanvraag')
    expect(faseVoorstelVoor(null, null)).toBe('aanvraag')
  })

  it('laat de categorie winnen van de soort', () => {
    // Servicedesk wordt in heel EVA uit de categorie afgeleid en de Bouw7-sync
    // dwingt dat elke ronde terug; een opdrachtbon op Dagelijks onderhoud hoort
    // dus op het servicedeskbord en niet in de opdrachtfase.
    expect(faseVoorstelVoor('Dagelijks onderhoud', 'opdrachtbon')).toBe('servicedesk')
    expect(faseVoorstelVoor('Mutatie', 'meerwerk')).toBe('servicedesk')
  })
})

describe('beoordeelVeld: van waarneming naar kleur', () => {
  it('kleurt een leeg verplicht veld rood', () => {
    expect(beoordeelVeld({ gevuld: false }, 'verplicht').status).toBe('ontbreekt')
  })

  it('laat een leeg gewenst veld kleurloos', () => {
    expect(beoordeelVeld({ gevuld: false }, 'gewenst').status).toBe('neutraal')
  })

  it('dimt een veld dat geen rol speelt, ook als het leeg is', () => {
    // Anders zou een opdracht op een offerte acht rode velden tonen voor gegevens
    // die gewoon op het dossier staan.
    expect(beoordeelVeld({ gevuld: false }, 'nvt').status).toBe('gedimd')
    expect(beoordeelVeld({ gevuld: true, score: 0.2 }, 'nvt').status).toBe('gedimd')
  })

  it('is groen boven de drempel en oranje eronder', () => {
    expect(beoordeelVeld({ gevuld: true, score: 0.9 }, 'verplicht').status).toBe('zeker')
    expect(beoordeelVeld({ gevuld: true, score: 0.6 }, 'verplicht').status).toBe('twijfel')
  })

  it('negeert de score zodra de waarde is vastgesteld', () => {
    // Een werkmaatschappij die uit de categorieregel volgt, of een adres dat de
    // adresservice bevestigde: daar zegt de modelscore niets meer over.
    const o = beoordeelVeld({ gevuld: true, score: 0.3, vastgesteld: true }, 'verplicht')
    expect(o.status).toBe('zeker')
    expect(o.score).toBeNull()
  })

  it('zet een afwijking met het dossier op oranje, ook bij een hoge score', () => {
    const o = beoordeelVeld(
      { gevuld: true, score: 1, afwijkendInDossier: 'Schilderwerk' },
      'gewenst',
    )
    expect(o.status).toBe('twijfel')
    expect(o.reden).toContain('Schilderwerk')
  })

  it('twijfelt over een gevuld veld waar het model niets over zei', () => {
    expect(beoordeelVeld({ gevuld: true }, 'gewenst').status).toBe('twijfel')
  })
})

describe('ontbrekendeVelden en magAfhandelen', () => {
  const leeg = (velden: VeldSleutel[]) =>
    Object.fromEntries(velden.map(v => [v, { gevuld: false }]))

  it('houdt een lege aanvraag tegen en noemt precies wat er mist', () => {
    const eisen = eisenVoor('nieuw_dossier', 'offerteaanvraag')
    const oordelen = beoordeelAlleVelden({}, eisen)
    expect(magAfhandelen(oordelen)).toBe(false)
    expect(ontbrekendeVelden(oordelen)).toEqual([
      'klant_naam', 'werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode',
      'werkadres_stad', 'omschrijving', 'categorie_voorstel', 'werkmaatschappij_voorstel',
    ])
  })

  it('laat een volledige aanvraag door', () => {
    const eisen = eisenVoor('nieuw_dossier', 'offerteaanvraag')
    const gevuld = Object.fromEntries(
      ALLE_VELDEN.map(v => [v, { gevuld: true, vastgesteld: true }]),
    )
    expect(magAfhandelen(beoordeelAlleVelden(gevuld, eisen))).toBe(true)
  })

  it('eist bij een opdracht op een offerte alleen klant en dossier', () => {
    const eisen = eisenVoor('offerte_winnen', 'opdracht_op_offerte')
    const oordelen = beoordeelAlleVelden(
      { klant_naam: { gevuld: true, vastgesteld: true }, offerte_dossier: { gevuld: true, vastgesteld: true } },
      eisen,
    )
    // De opdrachtreferentie komt uit de mail en is daar verplicht; die mist nog.
    expect(ontbrekendeVelden(oordelen)).toEqual(['opdracht_referentie'])
  })

  it('valt niet over een veld dat helemaal niet is waargenomen', () => {
    const eisen = eisenVoor('geen', 'meerwerk')
    expect(() => beoordeelAlleVelden(leeg([]), eisen)).not.toThrow()
  })

  it('eist bij meerwerk het dossier waarop het meerwerk komt', () => {
    // Meerwerk hoort bij een lopende opdracht. Het scherm stelde hier een nieuw
    // dossier voor, wat nooit klopt, en noemde het ontbrekende dossier niet.
    const eisen = eisenVoor('geen', 'meerwerk')
    expect(eisen.meerwerk_dossier).toBe('verplicht')
    expect(ontbrekendeVelden(beoordeelAlleVelden({}, eisen))).toEqual(['meerwerk_dossier'])
  })

  it('kent het meerwerkdossier niet bij de andere soorten', () => {
    for (const soort of ['offerteaanvraag', 'opdrachtbon', 'servicedeskbon'] as const) {
      expect(eisenVoor('nieuw_dossier', soort).meerwerk_dossier, soort).toBe('nvt')
    }
  })
})
