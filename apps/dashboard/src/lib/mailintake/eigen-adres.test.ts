import { describe, expect, it } from 'vitest'
import { domeinVan, isVrijMaildomein } from './triage'

/**
 * Het leergeheugen van de mailintake mag nooit leren van ons eigen adres.
 *
 * Vrijwel alle post komt doorgestuurd binnen: een collega stuurt de klantmail naar
 * de intakepostbus. Koppelde iemand zo'n bericht met de hand aan een klant, dan
 * onthield EVA "bas@everts.chat = die klant" en stelde die daarna voor bij élke
 * volgende mail die Bas doorstuurde.
 *
 * Er stonden er drie in productie, waaronder `info@everts.chat` -- de postbus zelf,
 * gekoppeld aan één opdrachtgever. Een meerwerkmail van Stichting VO Haaglanden
 * kreeg daardoor VvE De Linde voorgesteld, terwijl het model de juiste klant gewoon
 * had gelezen. Dat is het soort fout dat vertrouwen in de hele module kost: het
 * scherm sprak zichzelf tegen.
 *
 * De bescherming zit op twee plekken -- `onthoudAlias` maakt ze niet meer aan en
 * `herkenAfzender` slaat ze over -- en allebei leunen ze op `eigenDomeinen()`, dat
 * de domeinen van actieve medewerkers verzamelt. Deze test bewaakt de twee
 * bouwstenen daarvan; dat de set zelf klopt hangt van de database af.
 */
describe('domeinVan', () => {
  it('haalt het domein uit een adres, ongeacht hoofdletters of spaties', () => {
    expect(domeinVan('Bas@Everts.chat')).toBe('everts.chat')
    expect(domeinVan('  info@everts.chat ')).toBe('everts.chat')
  })

  it('geeft null bij iets dat geen adres is', () => {
    expect(domeinVan('bas')).toBeNull()
    expect(domeinVan('')).toBeNull()
    expect(domeinVan(null)).toBeNull()
  })
})

describe('isVrijMaildomein', () => {
  it('herkent de bekende vrije maildiensten', () => {
    // Een medewerker met een gmail-adres maakt gmail niet van ons: zou `eigenDomeinen`
    // die meenemen, dan werd elke klant die vanaf gmail mailt "ons eigen adres".
    for (const d of ['gmail.com', 'hotmail.com', 'outlook.com', 'ziggo.nl']) {
      expect(isVrijMaildomein(d), d).toBe(true)
    }
  })

  it('rekent een bedrijfsdomein daar niet toe', () => {
    for (const d of ['everts.chat', 'vohaaglanden.nl', 'kesslerperspektief.nl']) {
      expect(isVrijMaildomein(d), d).toBe(false)
    }
  })
})
