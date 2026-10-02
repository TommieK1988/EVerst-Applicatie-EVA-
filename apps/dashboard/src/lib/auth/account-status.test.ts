import { describe, expect, it } from 'vitest'
import { bepaalGeaccepteerd } from './account-status'

const basis = { gekoppeld: true, laatstIngelogd: null, linkGebruikt: false, openstaandeLinkSinds: null }

describe('bepaalGeaccepteerd', () => {
  it('nee zonder gekoppeld account, ook als er ooit is ingelogd', () => {
    expect(bepaalGeaccepteerd({ ...basis, gekoppeld: false, laatstIngelogd: '2026-10-01T10:00:00Z' })).toBe(false)
  })

  it('ja zodra een activatielink is gebruikt', () => {
    expect(bepaalGeaccepteerd({ ...basis, linkGebruikt: true })).toBe(true)
  })

  it('nee als er nog nooit is ingelogd', () => {
    expect(bepaalGeaccepteerd(basis)).toBe(false)
  })

  it('ja bij een login zonder openstaande uitnodiging (Microsoft, of de oude wachtwoordroute)', () => {
    expect(bepaalGeaccepteerd({ ...basis, laatstIngelogd: '2026-10-01T10:25:15Z' })).toBe(true)
  })

  it('nee als de enige login vóór de openstaande uitnodiging lag — de kapotte link van 1 oktober', () => {
    expect(bepaalGeaccepteerd({
      ...basis, laatstIngelogd: '2026-10-01T10:15:57Z', openstaandeLinkSinds: '2026-10-01T13:57:55Z',
    })).toBe(false)
  })

  it('ja als er ná de openstaande uitnodiging is ingelogd', () => {
    expect(bepaalGeaccepteerd({
      ...basis, laatstIngelogd: '2026-10-02T08:00:00Z', openstaandeLinkSinds: '2026-10-01T13:57:55Z',
    })).toBe(true)
  })
})
