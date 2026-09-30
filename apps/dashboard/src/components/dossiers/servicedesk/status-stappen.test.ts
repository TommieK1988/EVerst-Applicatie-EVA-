import { describe, expect, it } from 'vitest'
import { SERVICEDESK_ALLE_STATUSSEN, SERVICEDESK_STATUSSEN } from '../types'
import { BOUW7_NAAR_SERVICEDESK_SUBSTATUS, servicedeskKolom } from '@/lib/bouw7/status-afleiding'
import { standNaToewijzing, volgendeStap } from './status-stappen'

const KOLOMMEN = new Set<string>(SERVICEDESK_STATUSSEN.map(s => s.key))

describe('volgendeStap', () => {
  it('stuurt In voorbereiding naar Onderhanden', () => {
    expect(volgendeStap('in_voorbereiding')?.naar).toBe('loopt')
    expect(volgendeStap('in_voorbereiding')?.label).toBe('Werk gestart')
  })

  it('loopt door van Onderhanden naar Uitvoering gereed naar Kosten compleet', () => {
    expect(volgendeStap('loopt')?.naar).toBe('uitgevoerd')
    expect(volgendeStap('uitgevoerd')?.naar).toBe('kosten_compleet')
  })

  it('geeft geen stap waar een scherm, een handeling of een antwoord hoort', () => {
    // Uitzetten en inplannen volgen uit een daad; Wachten op opdrachtgever heeft zijn eigen drie
    // knoppen; financieel gereed heeft zijn eigen controles; vervallen is dicht.
    for (const van of ['nieuw', 'wacht_op_opdrachtgever', 'kosten_compleet', 'financieel_gereed', 'vervallen'] as const) {
      expect(volgendeStap(van), van).toBeUndefined()
    }
  })

  it('doet niets zonder stand', () => {
    expect(volgendeStap(null)).toBeUndefined()
    expect(volgendeStap(undefined)).toBeUndefined()
  })

  it('wijst alleen naar standen die een kolom hebben', () => {
    // Een typefout in `naar` zou een bon op een stand zetten die het bord niet toont: hij
    // verdwijnt dan zonder dat iemand ziet waarheen.
    for (const s of SERVICEDESK_ALLE_STATUSSEN) {
      const stap = volgendeStap(s.key)
      if (stap) expect(KOLOMMEN.has(stap.naar), `${s.key} → ${stap.naar}`).toBe(true)
    }
  })

  it('loopt vooruit, nooit terug', () => {
    // Een stap die terugwijst laat een bon op het bord naar links springen.
    const volgorde = SERVICEDESK_STATUSSEN.map(s => s.key)
    for (const s of SERVICEDESK_STATUSSEN) {
      const stap = volgendeStap(s.key)
      if (!stap) continue
      expect(volgorde.indexOf(stap.naar), `${s.key} → ${stap.naar}`)
        .toBeGreaterThan(volgorde.indexOf(s.key))
    }
  })
})

describe('standNaToewijzing', () => {
  it('schuift een bon door naar In voorbereiding zodra het werk wordt toegewezen', () => {
    for (const van of ['nieuw', 'wacht_op_opdrachtgever'] as const) {
      expect(standNaToewijzing(van), van).toBe('in_voorbereiding')
    }
  })

  it('laat een bon die al voorbereid wordt of loopt met rust', () => {
    // Een tweede opdracht op een lopende bon is extra werk, geen stap terug.
    for (const van of ['in_voorbereiding', 'loopt', 'uitgevoerd', 'kosten_compleet', 'financieel_gereed', 'vervallen'] as const) {
      expect(standNaToewijzing(van), van).toBeUndefined()
    }
  })

  it('doet niets zonder stand', () => {
    expect(standNaToewijzing(null)).toBeUndefined()
  })
})

describe('het bord en de Bouw7-sync spreken dezelfde taal', () => {
  /**
   * Een stand zonder kolom laat een bon van het bord verdwijnen: DossierKanban legt hem dan stil in
   * de eerste kolom. De enige stand zonder kolom die mag voorkomen is `vervallen` — die haalt de
   * boardquery er bewust af, hij staat op Afgesloten.
   */
  it('elke Bouw7-projectstatus landt op een kolom of op Vervallen', () => {
    for (const [bouw7, stand] of Object.entries(BOUW7_NAAR_SERVICEDESK_SUBSTATUS)) {
      expect(KOLOMMEN.has(stand) || stand === 'vervallen', `${bouw7} → ${stand}`).toBe(true)
    }
  })

  it('elke offertestatus op 01. landt op een kolom of op Vervallen', () => {
    for (const offerte of [null, '01. Nieuw', '02. Onderhanden', '03. Verstuurd', '04. Gewonnen',
      '05. Verloren', '06. Vervallen', '07. Mondelinge toezegging']) {
      const stand = servicedeskKolom('01. Offerte', null, offerte)
      expect(KOLOMMEN.has(stand) || stand === 'vervallen', `${offerte} → ${stand}`).toBe(true)
    }
  })

  it('kent de samengevoegde standen niet meer als kolom', () => {
    for (const oud of ['mandaat_verhoging', 'offerte_uitgebracht', 'opgenomen', 'uitgezet', 'ingepland']) {
      expect(KOLOMMEN.has(oud), oud).toBe(false)
    }
  })

  it('heeft nog wel een label voor de oude standen uit de historie', () => {
    const labels = new Map(SERVICEDESK_ALLE_STATUSSEN.map(s => [s.key as string, s.label]))
    expect(labels.get('uitgezet')).toBe('Uitgezet')
    expect(labels.get('mandaat_verhoging')).toBe('Mandaat verhoging aangevraagd')
    expect(labels.get('vervallen')).toBe('Vervallen')
  })
})
