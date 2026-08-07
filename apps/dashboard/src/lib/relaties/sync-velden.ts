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
] as const

export const BOUW7_CONTACTPERSOON_VELDEN = [
  'voornaam',
  'achternaam',
  'email',
  'telefoon',
] as const

/** Kolomnamen uit een patch die door de sync overschreven zouden worden. */
export function beschermdeVelden(
  patch: Record<string, unknown>,
  toegestaan: readonly string[],
): string[] {
  return Object.keys(patch).filter(k => patch[k] !== undefined && toegestaan.includes(k))
}
