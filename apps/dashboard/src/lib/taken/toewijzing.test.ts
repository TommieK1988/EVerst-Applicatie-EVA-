import { describe, expect, it } from 'vitest'
import { hangtNergensAan, toewijzingenVoorNieuweActie } from './toewijzing'

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
