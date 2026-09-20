import { describe, expect, it } from 'vitest'
import { substatusSectie } from './substatus-map'

/**
 * De fase-bepaling voor een gekozen substatus. Dit is de regel die voorkomt dat een
 * aanvraag-substatus in de `offerte_substatus`-kolom belandt (en omgekeerd): dat zijn twee
 * aparte enums, dus de verkeerde kolom geeft een harde databasefout.
 */
describe('substatusSectie', () => {
  it('stuurt een aanvraag-substatus naar de aanvraagfase, ook vanuit een offertedossier', () => {
    // Een zojuist verzonden offerte staat nog zeven dagen op de Aanvragen-tab; wie hem daar
    // terugzet op "Nieuw" verwacht een aanvraag, geen fout.
    expect(substatusSectie('nieuw', 'offerte')).toBe('aanvraag')
    expect(substatusSectie('werkopname', 'offerte')).toBe('aanvraag')
    expect(substatusSectie('offerte_gereed', 'offerte')).toBe('aanvraag')
    expect(substatusSectie('afgewezen', 'offerte')).toBe('aanvraag')
  })

  it('stuurt een offerte-substatus naar de offertefase, ook vanuit een aanvraagdossier', () => {
    // Bouw7-projecten met projectstatus 08/09 staan op de Offertes-tab terwijl EVA ze nog
    // als aanvraag kent.
    expect(substatusSectie('verzonden', 'aanvraag')).toBe('offerte')
    expect(substatusSectie('nabellen', 'aanvraag')).toBe('offerte')
    expect(substatusSectie('in_behandeling', 'aanvraag')).toBe('offerte')
    expect(substatusSectie('gewonnen', 'aanvraag')).toBe('offerte')
    expect(substatusSectie('verloren', 'aanvraag')).toBe('offerte')
  })

  it('laat een dossier bij "vervallen" staan waar het staat — die sleutel kent beide fases', () => {
    expect(substatusSectie('vervallen', 'aanvraag')).toBe('aanvraag')
    expect(substatusSectie('vervallen', 'offerte')).toBe('offerte')
  })

  it('geeft null bij een sleutel buiten de aanvraag/offerte-ladder', () => {
    expect(substatusSectie('onderhanden', 'offerte')).toBeNull()
    expect(substatusSectie('financieel_gereed', 'aanvraag')).toBeNull()
  })
})
