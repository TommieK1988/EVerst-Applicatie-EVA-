import { describe, expect, it } from 'vitest'
import { getDossierSubstatus, type Dossier } from './types'

/**
 * Servicedeskbonnen staan op `hoofdstatus = 'aanvraag'` met een eigen ladder ernaast.
 * Wie alleen op hoofdstatus kiest, krijgt voor élke bon 'nieuw' terug — ook voor een
 * bon die allang is uitgevoerd.
 *
 * Die aanname is in deze codebase al drie keer misgegaan: de snapshot-cron haalde bij
 * bonnen nooit uren en inkoop op, de mobiele dossierlijst zette ze onder Aanvragen, en
 * de IFTTT-taaktriggers hadden een servicedesk-tak die onbereikbaar was omdat hij
 * áchter de hoofdstatus-checks stond.
 *
 * Vandaar deze test op de helper zelf: die is de bron waar de rest uit put.
 */
function bon(velden: Partial<Dossier>): Dossier {
  return {
    hoofdstatus: 'aanvraag',
    aanvraag_substatus: 'nieuw',
    offerte_substatus: null,
    opdracht_substatus: null,
    servicedesk_substatus: null,
    ...velden,
  } as Dossier
}

describe('getDossierSubstatus: de servicedeskladder gaat voor', () => {
  it('geeft de servicedesk-substatus, niet de aanvraag-substatus', () => {
    // De situatie die de fout zichtbaar maakte: een bon die is uitgevoerd, maar in de
    // aanvraagkolom nog op 'nieuw' staat omdat servicedesk geen eigen hoofdstatus is.
    expect(getDossierSubstatus(bon({ servicedesk_substatus: 'uitgevoerd' }))).toBe('uitgevoerd')
  })

  it('ook bij financieel gereed', () => {
    expect(getDossierSubstatus(bon({ servicedesk_substatus: 'financieel_gereed' })))
      .toBe('financieel_gereed')
  })

  it('laat een echte aanvraag met rust', () => {
    expect(getDossierSubstatus(bon({ aanvraag_substatus: 'werkopname' }))).toBe('werkopname')
  })

  it('laat een offerte met rust', () => {
    expect(getDossierSubstatus(bon({
      hoofdstatus: 'offerte', aanvraag_substatus: null, offerte_substatus: 'verzonden',
    }))).toBe('verzonden')
  })

  it('laat een opdracht met rust', () => {
    expect(getDossierSubstatus(bon({
      hoofdstatus: 'opdracht', aanvraag_substatus: null, opdracht_substatus: 'onderhanden',
    }))).toBe('onderhanden')
  })

  it('de omweg die aanroepers zelf hadden geeft nu hetzelfde', () => {
    // Zes plekken deden `d.servicedesk_substatus ?? getDossierSubstatus(d)`. Die blijven
    // werken; deze test legt vast dat ze overbodig zijn geworden en niet iets ánders doen.
    const d = bon({ servicedesk_substatus: 'uitgezet' })
    expect(d.servicedesk_substatus ?? getDossierSubstatus(d)).toBe(getDossierSubstatus(d))
  })
})
