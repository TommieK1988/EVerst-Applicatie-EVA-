import { describe, expect, it } from 'vitest'
import { isNavigatieApp, navigatieLink } from './navigatie'

describe('navigatieLink — route naar het adres in de gekozen app', () => {
  const adres = 'Dorpsstraat 1, 1234 AB Ergens'

  it('gebruikt standaard Google Maps', () => {
    expect(navigatieLink(adres)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Dorpsstraat%201%2C%201234%20AB%20Ergens',
    )
  })

  it('opent Apple Kaarten met het adres als bestemming', () => {
    expect(navigatieLink(adres, 'apple')).toBe(
      'https://maps.apple.com/?daddr=Dorpsstraat%201%2C%201234%20AB%20Ergens',
    )
  })

  it('opent Waze en start meteen de navigatie', () => {
    expect(navigatieLink(adres, 'waze')).toBe(
      'https://waze.com/ul?q=Dorpsstraat%201%2C%201234%20AB%20Ergens&navigate=yes',
    )
  })

  it('codeert tekens die de URL zouden breken', () => {
    expect(navigatieLink('A & B #3', 'waze')).toBe('https://waze.com/ul?q=A%20%26%20B%20%233&navigate=yes')
  })
})

describe('isNavigatieApp', () => {
  it('accepteert alleen bekende apps', () => {
    expect(isNavigatieApp('google')).toBe(true)
    expect(isNavigatieApp('waze')).toBe(true)
    expect(isNavigatieApp('tomtom')).toBe(false)
    expect(isNavigatieApp(null)).toBe(false)
  })
})
