import { describe, expect, it, vi, afterEach } from 'vitest'
import { syncTijdLabel } from './sync-tijd'

afterEach(() => { vi.useRealTimers() })

describe('syncTijdLabel', () => {
  it('toont Nederlandse tijd, ongeacht de tijdzone van de server', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T13:20:00Z'))
    expect(syncTijdLabel('2026-10-14T11:13:00Z')).toBe('Vandaag 13:13')
  })
  it('telt de dag in Nederlandse tijd (23:30 UTC is al morgen)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T08:00:00Z'))
    expect(syncTijdLabel('2026-10-14T22:30:00Z')).toBe('Vandaag 00:30')
    expect(syncTijdLabel('2026-10-14T12:00:00Z')).toBe('Gisteren 14:00')
  })
})
