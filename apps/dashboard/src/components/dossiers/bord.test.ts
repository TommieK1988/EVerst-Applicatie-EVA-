import { describe, it, expect } from 'vitest'
import { bordVan } from './fase-plaatsing'

/**
 * `bordVan` is de TS-spiegel van de databasefunctie `dossier_bord`. Deze tests leggen de regels
 * vast die Tom op 30-09-2026 afsprak; de kruiscontrole tegen de echte kolom staat in
 * scratch/toets-bord.ts.
 */
const d = (
  status: string | null,
  categorie: string | null = 'Schilderwerk',
  hoofdstatus: string | null = 'aanvraag',
  opdracht_substatus: string | null = null,
) => ({ bouw7_projectstatus_naam: status, bouw7_categorie_naam: categorie, hoofdstatus, opdracht_substatus })

describe('bordVan', () => {
  it('zet Dagelijks onderhoud en Mutatie altijd op de servicedesk', () => {
    expect(bordVan(d('04. Onderhanden', 'Dagelijks onderhoud', 'aanvraag'))).toBe('servicedesk')
    expect(bordVan(d('06. Financieel gereed', 'Mutatie'))).toBe('servicedesk')
    expect(bordVan(d('01. Offerte', 'Mutatie'))).toBe('servicedesk')
  })

  it('zet een lopende bon op de servicedesk, ook met een verkeerde categorie', () => {
    expect(bordVan(d('LB. Lopende bonnen', 'Mutatie'))).toBe('servicedesk')
    expect(bordVan(d('LB. Lopende bonnen', 'Bouwkundig Onderhoud'))).toBe('servicedesk')
    expect(bordVan(d('LB. Lopende bonnen', null))).toBe('servicedesk')
  })

  it('volgt de Bouw7-status voor de commerciële borden', () => {
    expect(bordVan(d('01. Offerte'))).toBe('aanvragen')
    expect(bordVan(d('09.Verzonden offertes', 'Schilderwerk', 'offerte'))).toBe('offertes')
    // Ook als EVA nog iets anders denkt: de Bouw7-status wint, het bord toont de afwijking.
    expect(bordVan(d('09.Verzonden offertes', 'Schilderwerk', 'aanvraag'))).toBe('offertes')
    expect(bordVan(d('01. Offerte', 'Schilderwerk', 'offerte'))).toBe('aanvragen')
  })

  it('zet 08. Afgewezen bij de fase waar het dossier vandaan komt', () => {
    expect(bordVan(d('08. Afgewezen', 'Schilderwerk', 'aanvraag'))).toBe('aanvragen')
    expect(bordVan(d('08. Afgewezen', 'Schilderwerk', 'offerte'))).toBe('offertes')
  })

  it('zet 02 t/m 06 op Opdrachten, ook categorie Overige', () => {
    for (const s of ['02. Nieuwe opdracht', '03. Werkvoorbereiding', '04. Onderhanden', '05. Uitvoering gereed', '06. Financieel gereed']) {
      expect(bordVan(d(s, 'Renovatie', 'opdracht'))).toBe('opdrachten')
    }
    expect(bordVan(d('04. Onderhanden', 'Overige', 'opdracht'))).toBe('opdrachten')
    expect(bordVan(d('04. Onderhanden', null, 'opdracht'))).toBe('opdrachten')
  })

  it('houdt 07 en 00 van de werkborden', () => {
    expect(bordVan(d('07. Financieel afgesloten', 'Schilderwerk', 'opdracht'))).toBe('afgesloten')
    expect(bordVan(d('00. Intern', 'Overige'))).toBe('intern')
  })

  it('laat dossiers zonder Bouw7-status de hoofdstatus volgen', () => {
    expect(bordVan(d(null, null, 'aanvraag'))).toBe('aanvragen')
    expect(bordVan(d(null, null, 'offerte'))).toBe('offertes')
    expect(bordVan(d(null, null, 'opdracht', 'financieel_gereed'))).toBe('opdrachten')
    expect(bordVan(d(null, null, 'opdracht', 'financieel_afgesloten'))).toBe('afgesloten')
  })
})
