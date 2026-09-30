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

  it('kiest de servicedeskladder ook als de aanvraag-substatus gevuld is', () => {
    // Een bon dráágt altijd allebei: hoofdstatus 'aanvraag' met aanvraag_substatus 'nieuw',
    // én de servicedesk-substatus. De tweede wint. Dit was de kern van de fout.
    const d = bon({ aanvraag_substatus: 'nieuw', servicedesk_substatus: 'in_voorbereiding' })
    expect(getDossierSubstatus(d)).toBe('in_voorbereiding')
  })
})
