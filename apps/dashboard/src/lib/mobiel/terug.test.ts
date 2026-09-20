import { describe, expect, it } from 'vitest'
import { metTerug, veiligTerugPad } from './terug'

describe('veiligTerugPad — laat alleen mobiele paden door', () => {
  it('accepteert een pad binnen de mobiele app', () => {
    expect(veiligTerugPad('/m/commercieel/abc-123')).toBe('/m/commercieel/abc-123')
    expect(veiligTerugPad('/m/commercieel/cp/abc-123')).toBe('/m/commercieel/cp/abc-123')
  })

  it('weigert een absolute URL naar buiten', () => {
    expect(veiligTerugPad('https://kwaadaardig.nl')).toBeNull()
    // Protocol-relatief: een browser leest dit als een externe host, niet als een pad.
    expect(veiligTerugPad('//kwaadaardig.nl')).toBeNull()
    expect(veiligTerugPad('javascript:alert(1)')).toBeNull()
  })

  it('weigert een pad buiten de mobiele app', () => {
    expect(veiligTerugPad('/relaties/abc')).toBeNull()
    expect(veiligTerugPad('/instellingen/gebruikers')).toBeNull()
  })

  it('weigert backslashes, die sommige browsers als schuine streep lezen', () => {
    expect(veiligTerugPad('/m/\\kwaadaardig.nl')).toBeNull()
  })

  it('gaat om met ontbrekende en meervoudige waarden', () => {
    expect(veiligTerugPad(undefined)).toBeNull()
    expect(veiligTerugPad('')).toBeNull()
    // Next levert een array als de parameter twee keer in de URL staat; neem de eerste.
    expect(veiligTerugPad(['/m/commercieel/a', '/m/commercieel/b'])).toBe('/m/commercieel/a')
    expect(veiligTerugPad(['https://kwaadaardig.nl'])).toBeNull()
  })
})

describe('metTerug', () => {
  it('plakt de herkomst eraan, url-veilig', () => {
    expect(metTerug('/m/dossiers/1/informatie', '/m/commercieel/abc'))
      .toBe('/m/dossiers/1/informatie?terug=%2Fm%2Fcommercieel%2Fabc')
  })

  it('laat de link met rust als er geen herkomst is', () => {
    expect(metTerug('/m/dossiers/1/informatie', null)).toBe('/m/dossiers/1/informatie')
  })
})
