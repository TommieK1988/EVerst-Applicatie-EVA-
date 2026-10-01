import { describe, expect, it } from 'vitest'
import { bepaalRoute, heeftOfferteTreffer } from './types'

/**
 * Wanneer gaat een opdracht de offerteroute op, en wanneer wordt het een nieuw
 * dossier?
 *
 * Dit is geen smaakkwestie maar een knop. Op de offerteroute bestaat "Dossier
 * aanmaken" niet -- daar win je een bestaande offerte -- en stond er dus geen enkele
 * manier om een keurig gelezen opdrachtbon in te schrijven. Dat gebeurde in
 * productie bij een bon voor Zamenhofstraat 6: negen kandidaten met exact dezelfde
 * score van 0,65, allemaal op "zelfde straat en huisnummer" plus "zelfde
 * opdrachtgever op dit adres". Een pand met achtendertig units levert die score voor
 * elk dossier van die beheerder; dat de lijst geen onderscheid maakte, was het
 * bewijs dat hij niets identificeerde.
 */
describe('heeftOfferteTreffer', () => {
  it('gelooft een treffer op ons eigen offertenummer', () => {
    expect(heeftOfferteTreffer([{ soort: 'offerte_match', score: 1 }])).toBe(true)
    expect(heeftOfferteTreffer([{ soort: 'offerte_match', score: 0.9 }])).toBe(true)
  })

  it('gelooft een treffer op alleen het adres niet', () => {
    // Adres (0,40) + zelfde opdrachtgever daar (0,15) + zelfde postcode (0,10).
    const zamenhofstraat = Array.from({ length: 9 }, () => ({
      soort: 'offerte_match' as const, score: 0.65,
    }))
    expect(heeftOfferteTreffer(zamenhofstraat)).toBe(false)
  })

  it('kijkt alleen naar offertetreffers, niet naar duplicaten of meerwerk', () => {
    expect(heeftOfferteTreffer([
      { soort: 'duplicaat', score: 1 },
      { soort: 'meerwerk_kandidaat', score: 1 },
    ])).toBe(false)
  })

  it('valt niet over een lege lijst', () => {
    expect(heeftOfferteTreffer([])).toBe(false)
  })
})

describe('bepaalRoute bij een opdrachtbon', () => {
  it('wint de offerte als die onmiskenbaar is', () => {
    expect(bepaalRoute('opdrachtbon', true)).toBe('offerte_winnen')
  })

  it('maakt een nieuw dossier als er geen offerte bij hoort', () => {
    // Dit is de Zamenhofstraat-bon: wel kandidaten, geen van alle overtuigend.
    // Zonder deze uitkomst heeft het scherm geen knop om hem in te schrijven.
    expect(bepaalRoute('opdrachtbon', false)).toBe('nieuw_dossier')
  })

  it('houdt een opdracht op ónze offerte wel op de offerteroute', () => {
    // Die mail verwijst naar een offerte van ons; vinden we die niet, dan is dat een
    // zoekvraag voor een mens en geen reden om een tweede dossier te openen.
    expect(bepaalRoute('opdracht_op_offerte', false)).toBe('offerte_winnen')
    // Behalve bij regie: dan is er geen aanneemsom om te winnen.
    expect(bepaalRoute('opdracht_op_offerte', false, true)).toBe('nieuw_dossier')
  })
})
