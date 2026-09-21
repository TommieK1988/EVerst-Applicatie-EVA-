import type { KerstkaartAdres } from '@everts/database'

/**
 * Waar de kerstkaart van een contactpersoon heen gaat.
 *
 * De keuze staat op de persoon (`kerstkaart_adres`), maar het adres zelf komt van twee
 * verschillende plekken: het privé-adres op de persoon, of het bezoekadres van de organisatie
 * waar hij werkt. Eén plek waar die regel staat, zodat het contactpersoonscherm en de
 * kolommen in het overzicht niet uit elkaar kunnen lopen.
 *
 * Een factuuradres komt hier bewust niet voor: dat is een administratief adres (vaak een
 * postbus of het boekhoudkantoor) en daar hoort geen kaart heen.
 */

export type PersoonPriveAdres = {
  prive_adres_straat: string | null
  prive_adres_postcode: string | null
  prive_adres_plaats: string | null
  prive_adres_land: string | null
}

export type OrganisatieAdres = {
  naam: string
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
}

export type Bezorgadres = {
  /** Bedrijfsnaam boven het adres; leeg bij een privé-adres. */
  organisatie: string | null
  straat: string | null
  postcode: string | null
  plaats: string | null
  land: string | null
  /** Het adres als één regel, zonder bedrijfsnaam. Leeg = we hebben geen adres. */
  regel: string | null
}

/** Adres als één leesbare regel; leeg blijft leeg. Nederland laten we weg — dat is de regel, geen informatie. */
export function adresRegel(a: { straat?: string | null; postcode?: string | null; plaats?: string | null; land?: string | null }): string | null {
  return [
    a.straat,
    [a.postcode, a.plaats].filter(Boolean).join('  '),
    a.land && a.land !== 'Nederland' ? a.land : null,
  ].filter(Boolean).join(', ') || null
}

export function bezorgadres(
  keuze: KerstkaartAdres,
  persoon: PersoonPriveAdres,
  organisatie: OrganisatieAdres | null,
): Bezorgadres {
  if (keuze === 'zakelijk') {
    const adres = {
      straat: organisatie?.adres_straat ?? null,
      postcode: organisatie?.adres_postcode ?? null,
      plaats: organisatie?.adres_plaats ?? null,
      land: organisatie?.adres_land ?? null,
    }
    return { organisatie: organisatie?.naam ?? null, ...adres, regel: adresRegel(adres) }
  }
  const adres = {
    straat: persoon.prive_adres_straat,
    postcode: persoon.prive_adres_postcode,
    plaats: persoon.prive_adres_plaats,
    land: persoon.prive_adres_land,
  }
  return { organisatie: null, ...adres, regel: adresRegel(adres) }
}

/** Waarom er geen adres is — bruikbaarder dan een leeg veld. */
export function bezorgadresWaarschuwing(keuze: KerstkaartAdres, organisatieNaam: string | null): string {
  const oorzaak = keuze === 'zakelijk'
    ? organisatieNaam
      ? `Bij ${organisatieNaam} staat geen adres — vul dat op de relatiekaart in.`
      : 'Deze persoon is aan geen enkele organisatie gekoppeld.'
    : 'Er staat nog geen privé-adres bij Privégegevens.'
  return `${oorzaak} De kaart heeft zo geen bezorgadres.`
}
