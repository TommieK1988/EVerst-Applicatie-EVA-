import { describe, expect, it } from 'vitest'
import { bouwTekstBlok } from './prompt'

/**
 * De werkafspraken en de aanwijzing zijn de enige invoer in de prompt die van
 * binnen het bedrijf komt en wél als opdracht bedoeld is. Al het andere --
 * mailtekst, bijlagen -- staat er uitdrukkelijk als gegevens en niet als opdracht.
 *
 * Die scheiding is de hele beveiliging van dit blok. Raakt hij zoek, dan is er geen
 * verschil meer tussen wat de binnendienst zegt en wat een afzender in zijn
 * voettekst zet, en dat is precies wat prompt-injectie is. Vandaar deze tests op de
 * vorm: staan de blokken er, staan ze vóór de mail, en staat de grens erbij.
 */
/** De mailtekst als anker: '<email_body>' staat ook in de uitleg van de blokken. */
const MAILTEKST = 'Graag de lekkage verhelpen.'

const BASIS = {
  postbusSoort: 'servicedesk' as const,
  postbusAdres: 'servicedesk@everts.chat',
  onderwerp: 'Lekkage',
  vanNaam: 'Beheer',
  vanAdres: 'beheer@voorbeeld.nl',
  aan: ['servicedesk@everts.chat'],
  cc: [],
  ontvangenOp: '2026-10-06T08:00:00Z',
  bodyTekst: MAILTEKST,
  bijlagenamen: [],
  bekendeRelaties: [],
}

describe('werkafspraken in de prompt', () => {
  it('laat het blok weg als er geen afspraken zijn', () => {
    const t = bouwTekstBlok(BASIS)
    expect(t).not.toContain('<werkafspraken>')
    expect(t).not.toContain('<aanwijzing>')
  })

  it('zet de afspraken in een eigen blok vóór de mail', () => {
    const t = bouwTekstBlok({ ...BASIS, werkafspraken: ['Een mandaat betekent altijd regie.'] })
    expect(t).toContain('<werkafspraken>')
    expect(t).toContain('- Een mandaat betekent altijd regie.')
    // Vóór de mail: een afspraak hoort het lezen te sturen, niet als voetnoot mee
    // te komen nadat het model de mail al gelezen heeft.
    expect(t.indexOf('<werkafspraken>')).toBeLessThan(t.indexOf(MAILTEKST))
  })

  it('zet de grens er elke keer bij', () => {
    // De prompttekst is over regels afgebroken; vergelijk op één lange regel.
    const t = bouwTekstBlok({ ...BASIS, werkafspraken: ['Doe maar wat'] }).replace(/\s+/g, ' ')
    // Zonder deze twee zinnen is een afspraak een vrijbrief om velden te vullen die
    // niet in de mail staan -- en dan is de hele veldcontrole een formaliteit.
    expect(t).toMatch(/nooit een reden om een veld in te vullen dat niet in de mail/)
    expect(t).toMatch(/Spreekt een afspraak de mail tegen, dan volg je de mail/)
  })

  it('zet een aanwijzing ná de algemene afspraken', () => {
    const t = bouwTekstBlok({
      ...BASIS,
      werkafspraken: ['Algemeen'],
      aanwijzing: 'De opdrachtgever is de VvE, niet de beheerder.',
    })
    // Specifiek wint van algemeen; een model leest de laatste regel als de geldende.
    expect(t.indexOf('<werkafspraken>')).toBeLessThan(t.indexOf('<aanwijzing>'))
    expect(t.indexOf('<aanwijzing>')).toBeLessThan(t.indexOf(MAILTEKST))
  })

  it('zegt bij een aanwijzing wat er niet kan', () => {
    const t = bouwTekstBlok({ ...BASIS, aanwijzing: 'Splits deze mail op in twee aanvragen.' })
      .replace(/\s+/g, ' ')
    // Dit is het geval waar de gebruiker mee kwam. Het formulier kan het niet, en
    // dan hoort het model te doen wat het wél kan en dat te melden.
    expect(t).toMatch(/de mail opsplitsen/)
    expect(t).toMatch(/dan doe je wat je wél kunt/)
  })

  it('laat een lege of witruimte-aanwijzing weg', () => {
    expect(bouwTekstBlok({ ...BASIS, aanwijzing: '   ' })).not.toContain('<aanwijzing>')
    expect(bouwTekstBlok({ ...BASIS, aanwijzing: null })).not.toContain('<aanwijzing>')
  })
})
