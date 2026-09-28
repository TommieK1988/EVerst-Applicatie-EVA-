import { describe, expect, it } from 'vitest'
import { logtInMetMicrosoft, normaliseerEmail, MICROSOFT_DOMEIN } from './account-regels'

/**
 * De regel die hier wordt getest is geen stijlvoorkeur maar een storingsoorzaak: een medewerker
 * met twee auth-accounts komt nergens meer binnen en kan dat zelf niet oplossen. Vandaar ook de
 * randgevallen — hoofdletters, spaties en adressen die alleen maar op het domein lijken.
 */

describe('logtInMetMicrosoft', () => {
  it('herkent het bedrijfsdomein', () => {
    expect(logtInMetMicrosoft(`jan@${MICROSOFT_DOMEIN}`)).toBe(true)
  })

  it('trekt zich niets aan van hoofdletters en spaties', () => {
    expect(logtInMetMicrosoft(`  Jan.Jansen@${MICROSOFT_DOMEIN.toUpperCase()}  `)).toBe(true)
  })

  it('laat andere domeinen met rust', () => {
    expect(logtInMetMicrosoft('jan@gmail.com')).toBe(false)
    expect(logtInMetMicrosoft('jan@uitzendbureau.nl')).toBe(false)
  })

  it('trapt niet in een adres dat alleen maar op het domein lijkt', () => {
    // Zonder de @-grens zou een aanvaller (of een typefout) met zo'n adres de
    // Microsoft-route krijgen en dus nooit een wachtwoordaccount kunnen zijn.
    expect(logtInMetMicrosoft(`jan@niet-${MICROSOFT_DOMEIN}`)).toBe(false)
    expect(logtInMetMicrosoft(`jan@${MICROSOFT_DOMEIN}.example.com`)).toBe(false)
    expect(logtInMetMicrosoft(`${MICROSOFT_DOMEIN}@gmail.com`)).toBe(false)
  })

  it('zegt nee bij een leeg of ontbrekend adres', () => {
    expect(logtInMetMicrosoft(null)).toBe(false)
    expect(logtInMetMicrosoft(undefined)).toBe(false)
    expect(logtInMetMicrosoft('   ')).toBe(false)
  })
})

describe('normaliseerEmail', () => {
  it('maakt adressen vergelijkbaar', () => {
    expect(normaliseerEmail('  Jan@Everts.Chat ')).toBe('jan@everts.chat')
  })

  it('maakt van leeg null, zodat een vergelijking nooit per ongeluk slaagt', () => {
    expect(normaliseerEmail('')).toBeNull()
    expect(normaliseerEmail('  ')).toBeNull()
    expect(normaliseerEmail(null)).toBeNull()
  })
})
