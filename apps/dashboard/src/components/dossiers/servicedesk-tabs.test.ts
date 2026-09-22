import { describe, expect, it } from 'vitest'
import {
  SERVICEDESK_GROEPEN,
  SERVICEDESK_OUDE_TABS,
  servicedeskDeel,
  servicedeskGroep,
  zichtbareServicedeskGroepen,
} from './servicedesk-tabs'

const GEEN_TOGGLES = { toggles: new Set<string>(), heeftCalculatie: false }

describe('servicedesk-tabs: de tabel zelf', () => {
  it('geeft elke groep en elk deel een unieke sleutel', () => {
    const slugs = SERVICEDESK_GROEPEN.map(g => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)

    for (const g of SERVICEDESK_GROEPEN) {
      const delen = g.delen.map(d => d.deel)
      expect(new Set(delen).size, `dubbel deel in ${g.slug}`).toBe(delen.length)
    }
  })

  it('laat geen tab op twee plekken landen', () => {
    const tabs = SERVICEDESK_GROEPEN.flatMap(g => g.delen.map(d => d.tab))
    expect(new Set(tabs).size).toBe(tabs.length)
  })
})

describe('servicedesk-tabs: omleiden van oude links', () => {
  /**
   * De val waar dit tegen beschermt: `inkoop` is zowel een groep-sleutel als de tab achter
   * het deel "Geboekte kosten". Zou die in de omleidingstabel staan, dan stuurt
   * /servicedesk/x/inkoop naar /servicedesk/x/inkoop?deel=kosten, waar de omleiding opnieuw
   * vuurt — een eindeloze lus in de browser van de gebruiker.
   */
  it('stuurt geen enkele groep-sleutel naar zichzelf', () => {
    for (const slug of SERVICEDESK_GROEPEN.map(g => g.slug)) {
      expect(SERVICEDESK_OUDE_TABS[slug], `${slug} verwijst naar zichzelf`).toBeUndefined()
    }
  })

  it('laat elke oude tab op zijn eigen deel landen', () => {
    expect(SERVICEDESK_OUDE_TABS.informatie).toBe('bon?deel=informatie')
    expect(SERVICEDESK_OUDE_TABS.taken).toBe('bon?deel=acties')
    expect(SERVICEDESK_OUDE_TABS.calculatie).toBe('voorbereiding?deel=calculatie')
    expect(SERVICEDESK_OUDE_TABS.uren).toBe('uitvoering?deel=uren')
    expect(SERVICEDESK_OUDE_TABS.werkbegroting).toBe('inkoop?deel=werkbegroting')
    expect(SERVICEDESK_OUDE_TABS.financieel).toBe('facturatie?deel=financieel')
  })

  it('laat `inkoop` bewust zonder omleiding, zodat hij op zijn eigen groep landt', () => {
    expect(SERVICEDESK_OUDE_TABS.inkoop).toBeUndefined()
    expect(servicedeskGroep('inkoop')?.label).toBe('Inkoop')
  })
})

describe('servicedesk-tabs: sleutels die zowel groep als tab zijn', () => {
  /**
   * `kosten` rendert de tab `inkoop`, en `inkoop` is óók een groep. Dat mág, maar het legt een
   * eis op aan de router: die moet een groep naar het rénderen van één tab sturen en niet naar
   * zichzelf. Gebeurt dat wel, dan tekent hij de deelbalk twee keer en valt de deelkeuze weg —
   * precies wat er in de browser gebeurde vóór `renderTabContent` en `renderEnkeleTab` uit
   * elkaar zijn gehaald.
   *
   * Deze test legt het bestaan van zo'n sleutel vast. Ziet iemand hem later per ongeluk
   * verdwijnen of juist verschijnen, dan is dit de plek waar de reden staat.
   */
  it('benoemt welke tab-sleutels tegelijk een groep zijn', () => {
    const groepSlugs = new Set<string>(SERVICEDESK_GROEPEN.map(g => g.slug))
    const botsend = SERVICEDESK_GROEPEN
      .flatMap(g => g.delen)
      .filter(d => groepSlugs.has(d.tab))
      .map(d => d.tab)

    expect(botsend).toEqual(['inkoop'])
  })
})

describe('servicedesk-tabs: welke tabs een bon laat zien', () => {
  it('toont Opname & offerte niet op een gewone bon op regie', () => {
    const slugs = zichtbareServicedeskGroepen(GEEN_TOGGLES).map(g => g.slug)
    expect(slugs).toEqual(['bon', 'uitvoering', 'inkoop', 'facturatie'])
  })

  it('toont Opname & offerte bij mutatiewerk', () => {
    const slugs = zichtbareServicedeskGroepen({
      toggles: new Set(['mutatie_opname']), heeftCalculatie: false,
    }).map(g => g.slug)
    expect(slugs).toContain('voorbereiding')
  })

  it('toont Opname & offerte zodra er een calculatie hangt', () => {
    const slugs = zichtbareServicedeskGroepen({
      toggles: new Set<string>(), heeftCalculatie: true,
    }).map(g => g.slug)
    expect(slugs).toContain('voorbereiding')
  })
})

describe('servicedesk-tabs: het gekozen deel', () => {
  const inkoop = servicedeskGroep('inkoop')!

  it('valt terug op het eerste deel zonder keuze', () => {
    expect(servicedeskDeel(inkoop, undefined).deel).toBe('werkbegroting')
  })

  it('valt terug op het eerste deel bij een onbekende keuze', () => {
    expect(servicedeskDeel(inkoop, 'bestaat-niet').deel).toBe('werkbegroting')
  })

  it('geeft de tab terug die het deel moet renderen', () => {
    expect(servicedeskDeel(inkoop, 'kosten').tab).toBe('inkoop')
  })

  it('kent geen groep voor een tab die er geen is', () => {
    expect(servicedeskGroep('kam')).toBeUndefined()
    expect(servicedeskGroep('houtrot')).toBeUndefined()
  })
})
