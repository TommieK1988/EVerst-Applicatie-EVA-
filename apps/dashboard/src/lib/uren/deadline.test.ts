import { describe, expect, it, vi } from 'vitest'

vi.mock('@everts/database/server', () => ({ createAdminClient: () => ({}) }))

import { goedkeurDeadline, indienDeadline, type UrenInstellingen } from './instellingen'

const inst = {
  indien_deadline_dag: 5, indien_deadline_tijd: '17:00:00',
  goedkeur_deadline_dag: 1, goedkeur_deadline_tijd: '12:00:00',
} as UrenInstellingen

describe('deadlines van de weekstaat', () => {
  it('goedkeuren: maandag 12:00 NL ná de week (zomertijd)', () => {
    expect(goedkeurDeadline('2026-10-05', inst).toISOString()).toBe('2026-10-12T10:00:00.000Z')
  })

  it('goedkeuren: maandag 12:00 NL ná de week (wintertijd)', () => {
    expect(goedkeurDeadline('2026-10-26', inst).toISOString()).toBe('2026-11-02T11:00:00.000Z')
  })

  it('indienen: vrijdag 17:00 NL van dezelfde week', () => {
    expect(indienDeadline('2026-10-05', inst).toISOString()).toBe('2026-10-09T15:00:00.000Z')
  })
})
