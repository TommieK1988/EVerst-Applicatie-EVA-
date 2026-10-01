import { describe, expect, it } from 'vitest'
import { extractieSchema } from './schema'
import { keurEnKalibreer, type WitteLijsten } from './extractie'

/**
 * Een mandaat betekent altijd regie.
 *
 * Een mandaat is een plafond: tot dit bedrag mogen we werken. Dat is de vorm van
 * nacalculatie -- geen aanneemsom, afrekenen op uren en materiaal. Het model leidde
 * dat niet af en de woordenlijst evenmin: van de eenendertig servicedeskbonnen in
 * productie hadden er negen een mandaat, en geen enkele stond op regie. Die gingen
 * dus als aangenomen werk de deur uit, met een aanneemsom naar Bouw7 die niemand had
 * afgesproken.
 *
 * De tweede helft van deze tests bewaakt wat die regel niet mag doen. De categorie
 * bepaalt het bord en regie bepaalt de afrekenwijze; laat je die meebewegen, dan
 * verdwijnt elke servicedeskbon met een mandaat van het servicedeskbord -- en dat
 * merkt niemand tot de bon kwijt is.
 */
const LIJSTEN: WitteLijsten = {
  categorieen: [
    { id: 1, naam: 'Dagelijks onderhoud' },
    { id: 2, naam: 'Mutatie' },
    { id: 3, naam: 'Bouwkundig Onderhoud' },
    { id: 4, naam: 'Schilderwerk' },
  ],
  werkmaatschappijen: [],
}

/** Een lezing zonder adres, zodat de adresservice er niet aan te pas komt. */
const lezing = (bij: Record<string, unknown>) =>
  extractieSchema.parse({ soort: 'servicedeskbon', samenvatting: 'Werkbon', soort_vertrouwen: 0.9, ...bij })

const keur = (bij: Record<string, unknown>, brontekst: string, isServicedesk = false) =>
  keurEnKalibreer(lezing(bij), LIJSTEN, brontekst, {
    ontvangenOp: '2026-10-01T08:00:00Z',
    isServicedesk,
    standaardCategorieId: 1,
  })

describe('een mandaat betekent regie', () => {
  it('zet regie aan bij een mandaat, ook als het model dat niet zei', async () => {
    const v = await keur(
      { mandaat_bedrag: 750, regie: false },
      'Wij geven u een mandaat van 750 euro voor deze werkzaamheden.',
    )
    expect(v.mandaatBedrag).toBe(750)
    expect(v.regie).toBe(true)
  })

  it('legt uit waaróm het regie is, zodat het scherm geen onzin meldt', async () => {
    const v = await keur(
      { mandaat_bedrag: 750, regie: false },
      'Budget: maximaal 750 euro.',
    )
    // Zonder deze uitleg staat er "EVA vond hier geen aanwijzing voor" onder een
    // vinkje dat EVA zelf net heeft aangezet.
    expect(v.regieAanwijzing).toMatch(/mandaat/i)
  })

  it('laat een bedrag zonder mandaatwoord met rust', async () => {
    // Een los bedrag in een bon is veel vaker de prijsindicatie dan het plafond.
    const v = await keur(
      { mandaat_bedrag: 750, regie: false },
      'De kosten komen uit op ongeveer 750 euro.',
    )
    expect(v.mandaatBedrag).toBeNull()
    expect(v.regie).toBe(false)
  })

  it('houdt regie uit de tekst overeind zonder mandaat', async () => {
    const v = await keur(
      { regie: true, regie_aanwijzing: 'op regiebasis uitvoeren' },
      'Graag op regiebasis uitvoeren.',
    )
    expect(v.regie).toBe(true)
    expect(v.mandaatBedrag).toBeNull()
  })
})

describe('de categorie beweegt niet mee met regie', () => {
  it('houdt een servicedeskbon met mandaat op het servicedeskbord', async () => {
    const v = await keur(
      { mandaat_bedrag: 500, categorie_voorstel: 'Dagelijks onderhoud' },
      'Mandaat 500 euro.',
      true,
    )
    expect(v.regie).toBe(true)
    expect(v.categorieNaam).toBe('Dagelijks onderhoud')
  })

  it('haalt een regie-opdracht buiten de servicedeskpostbus er wel af', async () => {
    // Daarvoor bestaat die regel: een opdracht op regiebasis die per ongeluk
    // 'Mutatie' krijgt, hoort niet op het servicedeskbord.
    const v = await keur(
      { soort: 'opdrachtbon', categorie_voorstel: 'Mutatie', regie: true,
        regie_aanwijzing: 'in regie' },
      'Uit te voeren in regie.',
      false,
    )
    expect(v.regie).toBe(true)
    expect(v.categorieNaam).not.toBe('Mutatie')
  })
})
