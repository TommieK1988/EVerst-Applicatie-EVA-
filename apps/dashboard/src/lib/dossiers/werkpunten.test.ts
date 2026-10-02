import { describe, expect, it } from 'vitest'
import { adresRegel, dichtstbijzijnd, puntLabel, werkpuntenVan } from './werkpunten'

const hoofd = {
  werkadres_straat: 'Kerkstraat 1', werkadres_huisnummer: '1', werkadres_postcode: '8011 AB', werkadres_stad: 'Zwolle',
  adres_lat: 52.5125, adres_lng: 6.0944,
}
const extra = {
  id: 'w1', naam: 'Vestiging Deventer', straat: 'Brink', huisnummer: '10', postcode: '7411 BT', stad: 'Deventer',
  lat: 52.2533, lng: 6.1600,
}

describe('werkpuntenVan', () => {
  it('zet het hoofdadres eerst en neemt extra adressen mee', () => {
    const p = werkpuntenVan(hoofd, [extra])
    expect(p.map(x => x.werkadresId)).toEqual([null, 'w1'])
    expect(p[0].adres).toBe('Kerkstraat 1, Zwolle')
    expect(p[1].sleutel).toBe('7411bt|10')
  })

  it('slaat adressen zonder coördinaten over', () => {
    const p = werkpuntenVan({ ...hoofd, adres_lat: null, adres_lng: null }, [extra, { ...extra, id: 'w2', lat: null }])
    expect(p.map(x => x.werkadresId)).toEqual(['w1'])
  })

  it('werkt zonder hoofdadres', () => {
    expect(werkpuntenVan(null, [extra])).toHaveLength(1)
    expect(werkpuntenVan(null, [])).toEqual([])
  })
})

describe('dichtstbijzijnd', () => {
  it('kiest het dichtstbijzijnde adres', () => {
    const p = werkpuntenVan(hoofd, [extra])
    // ~100 m van de Brink in Deventer
    const best = dichtstbijzijnd({ lat: 52.2542, lng: 6.1600 }, p)
    expect(best?.punt.werkadresId).toBe('w1')
    expect(best!.afstand).toBeGreaterThan(80)
    expect(best!.afstand).toBeLessThan(120)
  })

  it('geeft null als er geen punten zijn', () => {
    expect(dichtstbijzijnd({ lat: 52, lng: 6 }, [])).toBeNull()
  })
})

describe('labels', () => {
  it('zet het huisnummer niet dubbel', () => {
    expect(adresRegel('Kerkstraat 1', '1', 'Zwolle')).toBe('Kerkstraat 1, Zwolle')
    expect(adresRegel('Kerkstraat', '1', null)).toBe('Kerkstraat 1')
    expect(adresRegel(null, null, null)).toBeNull()
  })

  it('combineert naam en adres', () => {
    expect(puntLabel({ naam: 'Vestiging', adres: 'Brink 10, Deventer' })).toBe('Vestiging — Brink 10, Deventer')
    expect(puntLabel({ naam: null, adres: 'Brink 10' })).toBe('Brink 10')
  })
})
