import { describe, expect, it } from 'vitest'
import { beschikbareNavigatieApps, isNavigatieApp, navigatieLink, opentApp } from './navigatie'

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

  it('laat Android de keuzelijst met alle navigatie-apps tonen', () => {
    expect(navigatieLink(adres, 'telefoon')).toBe('geo:0,0?q=Dorpsstraat%201%2C%201234%20AB%20Ergens')
  })

  it('stuurt Flitsmeister een geo-intent, met Google Maps als vangnet', () => {
    const link = navigatieLink(adres, 'flitsmeister')
    expect(link.startsWith('intent://0,0?q=Dorpsstraat%201%2C%201234%20AB%20Ergens#Intent;scheme=geo;package=nl.flitsmeister;')).toBe(true)
    expect(link.endsWith(';end')).toBe(true)
    const vangnet = decodeURIComponent(link.match(/S\.browser_fallback_url=([^;]+)/)![1])
    expect(vangnet).toBe(navigatieLink(adres, 'google'))
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

describe('beschikbareNavigatieApps', () => {
  it('toont de Android-keuzes alleen op Android', () => {
    expect(beschikbareNavigatieApps(true)).toEqual(['telefoon', 'google', 'apple', 'waze', 'flitsmeister'])
    expect(beschikbareNavigatieApps(false)).toEqual(['google', 'apple', 'waze'])
  })
})

describe('opentApp', () => {
  it('onderscheidt app-links van websites', () => {
    expect(opentApp('geo:0,0?q=x')).toBe(true)
    expect(opentApp('intent://0,0#Intent;end')).toBe(true)
    expect(opentApp('https://waze.com/ul?q=x')).toBe(false)
  })
})
