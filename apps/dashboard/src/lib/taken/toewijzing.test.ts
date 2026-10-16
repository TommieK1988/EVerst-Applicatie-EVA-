import { describe, expect, it } from 'vitest'
import { hangtNergensAan, toewijzingenVoorNieuweActie, zoekOpNaam } from './toewijzing'

describe('toewijzingenVoorNieuweActie', () => {
  it('geeft een losse actie zonder toewijzing aan de maker', () => {
    expect(toewijzingenVoorNieuweActie({}, 'ik')).toEqual([{ user_id: 'ik', rol: 'verantwoordelijke' }])
    expect(toewijzingenVoorNieuweActie({ assignees: [] }, 'ik')).toEqual([{ user_id: 'ik', rol: 'verantwoordelijke' }])
  })

  it('laat een gekozen toewijzing staan, ook als dat iemand anders is', () => {
    const collega = [{ user_id: 'collega', rol: 'reviewer' as const }]
    expect(toewijzingenVoorNieuweActie({ assignees: collega }, 'ik')).toBe(collega)
  })

  it('wijst niemand toe als de actie aan een dossier, lijst, medewerker of actie hangt', () => {
    for (const koppeling of [
      { dossier_id: 'd1' }, { lijst_id: 'l1' }, { medewerker_id: 'm1' }, { parent_task_id: 't1' },
    ]) {
      expect(hangtNergensAan(koppeling)).toBe(false)
      expect(toewijzingenVoorNieuweActie(koppeling, 'ik')).toEqual([])
    }
  })
})

describe('zoekOpNaam', () => {
  const lijst = [{ naam: 'Jan de Vries' }, { naam: 'Piet Jansen' }, { naam: 'Zoë Jäger' }]

  it('geeft iedereen bij een lege zoekterm', () => {
    expect(zoekOpNaam(lijst, '')).toBe(lijst)
    expect(zoekOpNaam(lijst, '   ')).toBe(lijst)
  })

  it('zoekt op een deel van voor- of achternaam, los van hoofdletters', () => {
    expect(zoekOpNaam(lijst, 'JAN')).toEqual([{ naam: 'Jan de Vries' }, { naam: 'Piet Jansen' }])
    expect(zoekOpNaam(lijst, 'vrie')).toEqual([{ naam: 'Jan de Vries' }])
  })

  it('vindt een naam met de woorden in een andere volgorde', () => {
    expect(zoekOpNaam(lijst, 'vries jan')).toEqual([{ naam: 'Jan de Vries' }])
    expect(zoekOpNaam(lijst, 'vries piet')).toEqual([])
  })

  it('negeert accenten aan beide kanten', () => {
    expect(zoekOpNaam(lijst, 'zoe jager')).toEqual([{ naam: 'Zoë Jäger' }])
    expect(zoekOpNaam(lijst, 'Zoë')).toEqual([{ naam: 'Zoë Jäger' }])
  })
})
