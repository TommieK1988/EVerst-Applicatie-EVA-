/**
 * Velden die de Bouw7-lees-sync overschrijft én die in EVA bewerkbaar zijn.
 *
 * Zodra een gebruiker zo'n veld in EVA aanpast wordt de kolomnaam vastgelegd in
 * `handmatige_velden`; de sync slaat die kolom daarna over. De lijsten staan hier
 * los van de server actions zodat zowel `lib/relaties/*-actions` als
 * `lib/bouw7/sync.ts` van dezelfde waarheid uitgaan.
 *
 * `types` staat er bewust NIET in: Bouw7 blijft leidend voor het hoofdtype en de
 * sync voegt in EVA toegevoegde types samen in plaats van ze te vervangen
 * (zie `voegTypesSamen` in lib/bouw7/sync.ts).
 */
export const BOUW7_RELATIE_VELDEN = [
  'naam',
  'kvk_nummer',
  'btw_nummer',
  'email',
  'telefoon',
  'mobiel',
  'opmerkingen',
  'adres_straat',
  'adres_postcode',
  'adres_plaats',
  'adres_land',
  'actief',
  // Komt uit `contactDivisions[].paymentConditionSales` op het Bouw7-detailrecord.
  'betalingstermijn_dagen',
] as const

export const BOUW7_CONTACTPERSOON_VELDEN = [
  'voornaam',
  'achternaam',
  'email',
  'telefoon',
  // Afgeleid uit de Bouw7-aanhef (`salutation`); zie `geslachtUitAanhef` in lib/bouw7/sync.ts.
  'geslacht',
] as const

// De generieke helpers staan sinds de uitrol naar dossiers/medewerkers in lib/bouw7;
// hier opnieuw geëxporteerd zodat de bestaande relatie-imports blijven werken.
export { beschermdeVelden } from '@/lib/bouw7/handmatige-velden'
