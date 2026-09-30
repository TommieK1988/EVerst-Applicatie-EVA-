import { describe, expect, it } from 'vitest'
import { werkomschrijvingUitTitel } from './werkomschrijving'

// Echte projectnamen, met het werkadres zoals het op het dossier staat.
const GEVALLEN: [string, { titel: string; straat: string; plaats: string; postcode?: string; dossiernummer?: string }, string][] = [
  ['adres, plaats - omschrijving',
    { titel: 'Verdistraat 101 t/m 227, Leiden - Schilderwerk volgens schema Claasen coatings', straat: 'Verdistraat 101 t/m 227', plaats: 'Leiden' },
    'Schilderwerk volgens schema Claasen coatings'],
  ['adres plaats, omschrijving',
    { titel: 'Lelievaart 55 Zoetermeer, buitenschilderwerk', straat: 'Lelievaart 55', plaats: 'Zoetermeer' },
    'Buitenschilderwerk'],
  ['adres, omschrijving zonder plaats',
    { titel: 'Jacob van Campenlaan 7-89, herstelwerkzaamheden balkons', straat: 'Jacob van Campenlaan 7-89', plaats: 'Hilversum' },
    'Herstelwerkzaamheden balkons'],
  ['komma in het adres',
    { titel: 'Steenlaan 32, 34 en 36 Rijswijk, bouwkundige werkzaamheden t.b.v. relinen standleidingen', straat: 'Steenlaan 32, 34 en 36', plaats: 'Rijswijk' },
    'Bouwkundige werkzaamheden t.b.v. relinen standleidingen'],
  ['geen scheidingsteken',
    { titel: 'Zamenhofstraat 6 Badkamer unit 14 Deur vervangen', straat: 'Zamenhofstraat 6 Badkamer unit 14', plaats: "'s-Gravenhage" },
    'Deur vervangen'],
  ['Gilde: omschrijving vóór het adres',
    { titel: 'Wandschilderwerk — Van Leeuwenhoekpark 55, Delft', straat: 'Van Leeuwenhoekpark 55', plaats: 'Delft' },
    'Wandschilderwerk'],
  ['Gilde met dubbele komma',
    { titel: 'Schilderwerk n.a.v. rapport Claasen — Gebouw CDR(S): Damstraat 1-15, Sluiskant 16-21,, Leidschendam', straat: 'Gebouw CDR(S): Damstraat 1-15, Sluiskant 16-21,', plaats: 'Leidschendam' },
    'Schilderwerk n.a.v. rapport Claasen'],
  ['tikfout in de straat: plaats vangt het op',
    { titel: 'Grovestinstraat 40 Den Haag, plafond kamer 0.01 herstellen n.a.v. lekkage', straat: 'Grovestinsstraat 40', plaats: 'Den Haag' },
    'Plafond kamer 0.01 herstellen n.a.v. lekkage'],
  ['dubbele spatie in het werkadres',
    { titel: 'Bikolaan 165 Delft,  kamermutatie', straat: 'Bikolaan  165', plaats: 'Delft' },
    'Kamermutatie'],
  ['voorvoegsel blijft staan',
    { titel: 'Complex 1630 - Beijersstraat 98-118, gevelonderhoud', straat: 'Beijersstraat 98-118', plaats: 'Den Haag' },
    'Complex 1630 - gevelonderhoud'],
  ['alleen een adres',
    { titel: 'MJOB 2025: Molenweg 71, Rozenburg', straat: 'Molenweg 71', plaats: 'Rozenburg' },
    'MJOB 2025'],
  ['projectnaam zonder adres',
    { titel: 'Indirecte (niet gewerkte) uren EOS', straat: 'de Star 3', plaats: 'Leidschendam' },
    'Indirecte (niet gewerkte) uren EOS'],
  ['dossiernummer in de naam',
    { titel: '20267.00542 Assendelftstraat 71, Den Haag - Diverse werkzaamheden', straat: 'Assendelftstraat 71', plaats: 'Den Haag', dossiernummer: '20267.00542' },
    'Diverse werkzaamheden'],
  ['plaats midden in een woord blijft staan',
    { titel: 'Raam 61-65, Gouda - Goudse dakinspectie', straat: 'Raam 61-65', plaats: 'Gouda' },
    'Goudse dakinspectie'],
]

describe('werkomschrijvingUitTitel', () => {
  for (const [naam, invoer, verwacht] of GEVALLEN) {
    it(naam, () => expect(werkomschrijvingUitTitel(invoer)).toBe(verwacht))
  }

  it('leeg blijft leeg', () => {
    expect(werkomschrijvingUitTitel({ titel: '' })).toBe('')
    expect(werkomschrijvingUitTitel({ titel: 'Molenweg 71, Rozenburg', straat: 'Molenweg 71', plaats: 'Rozenburg' })).toBe('')
  })
})
