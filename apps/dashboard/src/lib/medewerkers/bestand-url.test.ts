import { describe, expect, it, vi } from 'vitest'
vi.mock('@everts/database/client', () => ({ createClient: () => ({}) }))
import { medewerkerBestandPad } from './bestand-url'

describe('medewerkerBestandPad', () => {
  it('haalt het pad uit een publieke link naar de privé-bucket', () => {
    expect(medewerkerBestandPad('https://x.supabase.co/storage/v1/object/public/medewerker-bestanden/medewerkers/abc/handtekening_1.png'))
      .toBe('medewerkers/abc/handtekening_1.png')
  })
  it('laat andere links ongemoeid', () => {
    expect(medewerkerBestandPad('https://x.supabase.co/storage/v1/object/public/logo/a.png')).toBeNull()
    expect(medewerkerBestandPad(null)).toBeNull()
  })
})
