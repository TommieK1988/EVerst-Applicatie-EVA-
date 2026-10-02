import { describe, expect, it } from 'vitest'
import type { DossierMetBedrag } from './klantbeeld-types'
import { groepeerContactDossiers, totaalExclBtw } from './contactpersoon-groepen'

function dossier(over: Partial<DossierMetBedrag>): DossierMetBedrag {
  return {
    id: Math.random().toString(36).slice(2), dossiernummer: null, titel: 'x', fase: 'aanvraag',
    href: null, adres: null, jaar: 2026, updated_at: '2026-09-01', bedrag: null, rollen: [],
    contactpersoon: null, verzonden_op: null, object_id: null, bouw7_aanmaakdatum: null,
    aanvraagdatum: null, created_at: '2026-09-01', hoofdstatus: 'aanvraag',
    aanvraag_substatus: null, offerte_substatus: null, opdracht_substatus: null,
    servicedesk_substatus: null, bedragExclBtw: null,
    ...over,
  }
}

describe('groepeerContactDossiers', () => {
  it('zet een servicedeskbon bij de servicedesk, ook met hoofdstatus aanvraag', () => {
    const g = groepeerContactDossiers([
      dossier({ hoofdstatus: 'aanvraag', servicedesk_substatus: 'loopt', fase: 'servicedesk' }),
    ])
    expect(g.servicedesk).toHaveLength(1)
    expect(g.aanvragen).toHaveLength(0)
  })

  it('haalt verloren offertes en afgewezen aanvragen uit de gewone blokken', () => {
    const g = groepeerContactDossiers([
      dossier({ hoofdstatus: 'offerte', offerte_substatus: 'verloren', fase: 'afgesloten' }),
      dossier({ hoofdstatus: 'aanvraag', aanvraag_substatus: 'afgewezen' }),
      dossier({ hoofdstatus: 'offerte', offerte_substatus: 'verzonden', fase: 'offerte' }),
    ])
    expect(g.nietDoorgegaan).toHaveLength(2)
    expect(g.offertes).toHaveLength(1)
    expect(g.aanvragen).toHaveLength(0)
  })

  it('houdt afgeronde opdrachten in het opdrachtenblok, onder het lopende werk', () => {
    const af = dossier({ hoofdstatus: 'opdracht', opdracht_substatus: 'financieel_gereed', fase: 'opdracht' })
    const loopt = dossier({ hoofdstatus: 'opdracht', opdracht_substatus: 'onderhanden', fase: 'opdracht' })
    expect(groepeerContactDossiers([af, loopt]).opdrachten).toEqual([loopt, af])
  })
})

describe('totaalExclBtw', () => {
  it('telt alleen bekende bedragen op', () => {
    expect(totaalExclBtw([
      dossier({ bedragExclBtw: 1000.1 }), dossier({ bedragExclBtw: null }), dossier({ bedragExclBtw: 2.2 }),
    ])).toBe(1002.3)
  })
  it('geeft null zonder enig bedrag', () => {
    expect(totaalExclBtw([dossier({})])).toBeNull()
  })
})
