import { describe, expect, it } from 'vitest'
import {
  SERVICEDESK_ALLE_STATUSSEN, SERVICEDESK_MUTATIE_STATUSSEN, SERVICEDESK_STATUSSEN,
} from '../types'
import {
  BOUW7_NAAR_MUTATIE_SUBSTATUS, BOUW7_NAAR_SERVICEDESK_SUBSTATUS,
} from '@/lib/bouw7/status-afleiding'
import { standNaToewijzing, volgendeStap } from './status-stappen'

describe('volgendeStap', () => {
  it('stuurt elk van de drie startklare standen naar Loopt', () => {
    for (const van of ['uitgezet', 'ingepland', 'in_voorbereiding'] as const) {
      expect(volgendeStap(van)?.naar, van).toBe('loopt')
      expect(volgendeStap(van)?.label, van).toBe('Werk gestart')
    }
  })

  it('loopt door van Loopt naar Uitgevoerd naar Kosten compleet', () => {
    expect(volgendeStap('loopt')?.naar).toBe('uitgevoerd')
    expect(volgendeStap('uitgevoerd')?.naar).toBe('kosten_compleet')
  })

  it('geeft geen stap waar een scherm of een handeling hoort', () => {
    // Uitzetten en inplannen volgen uit een daad; financieel gereed heeft zijn eigen controles.
    for (const van of ['nieuw', 'opgenomen', 'offerte_uitgebracht', 'mandaat_verhoging', 'kosten_compleet', 'financieel_gereed'] as const) {
      expect(volgendeStap(van), van).toBeUndefined()
    }
  })

  it('doet niets zonder stand', () => {
    expect(volgendeStap(null)).toBeUndefined()
    expect(volgendeStap(undefined)).toBeUndefined()
  })

  it('wijst alleen naar standen die in een ladder bestaan', () => {
    // Een typefout in `naar` zou een bon op een kolom zetten die nergens getoond wordt: hij
    // verdwijnt dan van het bord zonder dat iemand ziet waarheen.
    const bestaand = new Set(SERVICEDESK_ALLE_STATUSSEN.map(s => s.key))
    for (const s of SERVICEDESK_ALLE_STATUSSEN) {
      const stap = volgendeStap(s.key)
      if (stap) expect(bestaand.has(stap.naar), `${s.key} → ${stap.naar}`).toBe(true)
    }
  })

  it('wijst nooit naar een kolom die de mutatieladder niet kent', () => {
    // Een bon op een stand die zijn eigen bord niet toont, verdwijnt van dat bord.
    const mutatie = new Set(SERVICEDESK_MUTATIE_STATUSSEN.map(s => s.key))
    for (const s of SERVICEDESK_MUTATIE_STATUSSEN) {
      const stap = volgendeStap(s.key)
      if (stap) expect(mutatie.has(stap.naar), `mutatie: ${s.key} → ${stap.naar}`).toBe(true)
    }
  })

  it('loopt binnen elke ladder vooruit, nooit terug', () => {
    // Een stap die terugwijst laat een bon op het bord naar links springen — precies de fout die
    // "Offerte akkoord" had. Toetsen moet per ladder: `SERVICEDESK_ALLE_STATUSSEN` plakt de twee
    // reeksen achter elkaar en is dus géén procesvolgorde (in_voorbereiding staat daar ná loopt).
    for (const [naam, ladder] of [
      ['onderhoud', SERVICEDESK_STATUSSEN],
      ['mutatie', SERVICEDESK_MUTATIE_STATUSSEN],
    ] as const) {
      const volgorde = ladder.map(s => s.key)
      for (const s of ladder) {
        const stap = volgendeStap(s.key)
        // Een stap naar een stand die deze ladder niet kent hoort hier niet thuis.
        if (!stap || !volgorde.includes(stap.naar)) continue
        expect(volgorde.indexOf(stap.naar), `${naam}: ${s.key} → ${stap.naar}`)
          .toBeGreaterThan(volgorde.indexOf(s.key))
      }
    }
  })
})

describe('standNaToewijzing', () => {
  it('schuift een onderhoudsbon door zodra het werk wordt toegewezen', () => {
    for (const van of ['nieuw', 'mandaat_verhoging', 'offerte_uitgebracht'] as const) {
      expect(standNaToewijzing('uitgezet', { isMutatie: false, substatus: van }), van).toBe('uitgezet')
      expect(standNaToewijzing('ingepland', { isMutatie: false, substatus: van }), van).toBe('ingepland')
    }
  })

  it('laat een bon die al loopt met rust', () => {
    // Een tweede opdracht op een lopende bon is extra werk, geen stap terug.
    for (const van of ['loopt', 'uitgevoerd', 'kosten_compleet', 'financieel_gereed'] as const) {
      expect(standNaToewijzing('uitgezet', { isMutatie: false, substatus: van }), van).toBeUndefined()
    }
  })

  it('raakt een mutatiebon nooit aan', () => {
    // `uitgezet` en `ingepland` staan niet op het mutatiebord; de bon zou daar verdwijnen.
    const mutatie = new Set(SERVICEDESK_MUTATIE_STATUSSEN.map(s => s.key))
    expect(mutatie.has('uitgezet' as never)).toBe(false)
    expect(mutatie.has('ingepland' as never)).toBe(false)

    for (const van of ['nieuw', 'opgenomen', 'in_voorbereiding'] as const) {
      expect(standNaToewijzing('uitgezet', { isMutatie: true, substatus: van }), van).toBeUndefined()
      expect(standNaToewijzing('ingepland', { isMutatie: true, substatus: van }), van).toBeUndefined()
    }
  })

  it('doet niets zonder stand', () => {
    expect(standNaToewijzing('uitgezet', { isMutatie: false, substatus: null })).toBeUndefined()
  })
})

describe('de standen die deze knoppen zetten, komen niet uit Bouw7', () => {
  /**
   * Waarom dit ertoe doet: de Bouw7-sync herleidt bij elke ronde een servicedesk-kolom uit de
   * projectstatus. Een stand die de sync óók kan produceren zou dus door de sync bevestigd of
   * overschreven worden; een stand die hij niet kent bestaat alléén doordat `updateServicedesk
   * Substatus` de kolom als handmatig markeert (zie sync.ts, `servicedeskOntmarkeren`).
   *
   * Zou iemand later een Bouw7-status op een van deze kolommen mappen, dan gaat de sync met de
   * knop vechten: de bon springt dan na elke synchronisatieronde terug. Deze test valt dan om,
   * met de reden erbij.
   */
  const ALLEEN_EVA = ['uitgezet', 'ingepland', 'kosten_compleet', 'mandaat_verhoging', 'opgenomen']

  it('geen enkele Bouw7-projectstatus leidt tot een EVA-eigen kolom', () => {
    const uitBouw7 = new Set([
      ...Object.values(BOUW7_NAAR_SERVICEDESK_SUBSTATUS),
      ...Object.values(BOUW7_NAAR_MUTATIE_SUBSTATUS),
    ])
    for (const stand of ALLEEN_EVA) {
      expect(uitBouw7.has(stand), `${stand} wordt óók door de sync gezet`).toBe(false)
    }
  })

  it('zet alleen kolommen waar de sync niet aan komt', () => {
    const doelen = [
      ...SERVICEDESK_ALLE_STATUSSEN.map(s => volgendeStap(s.key)?.naar).filter(Boolean),
      standNaToewijzing('uitgezet', { isMutatie: false, substatus: 'nieuw' }),
      standNaToewijzing('ingepland', { isMutatie: false, substatus: 'nieuw' }),
    ]
    // `loopt` en `uitgevoerd` komen wél uit Bouw7 (04. en 05.). Dat is geen fout: daar bevestigt
    // de sync de knop in plaats van hem tegen te spreken, zodra Bouw7 volgt.
    expect(doelen).toContain('uitgezet')
    expect(doelen).toContain('ingepland')
    expect(doelen).toContain('kosten_compleet')
  })
})
