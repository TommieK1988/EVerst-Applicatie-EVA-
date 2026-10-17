/**
 * o365/mappad.ts
 *
 * Paden van submappen binnen een dossiermap (`Tekeningen/Revisie 2`). Pure helpers,
 * zodat de controle op wat een client als uploadmap meestuurt testbaar is.
 */

/** Zoveel mapniveaus worden geopend, de dossiermap zelf meegeteld. */
export const MAX_MAPDIEPTE = 8

/** Tekens die SharePoint nooit in een naam toelaat, plus stuurtekens. */
// eslint-disable-next-line no-control-regex
const VERBODEN = /[\\:*?"<>|\u0000-\u001f]/

/**
 * Knipt een submap-pad op en controleert elk deel. `[]` = de dossiermap zelf;
 * `null` = ongeldig.
 *
 * Het pad komt van de client en wordt achter de dossiermap geplakt. Daarom wordt
 * alles geweigerd waarmee je eruit zou kunnen (`..`), plus lege delen en tekens die
 * in een bestaande SharePoint-map toch nooit voorkomen.
 */
export function mapPadDelen(pad: string): string[] | null {
  if (pad === '') return []
  const delen = pad.split('/')
  if (delen.length >= MAX_MAPDIEPTE) return null
  for (const deel of delen) {
    if (!deel.trim() || deel === '.' || deel === '..' || VERBODEN.test(deel)) return null
  }
  return delen
}

/**
 * Graph-pad voor een bestand in (een submap van) een map: `/drives/{d}/items/{map}:/a/b/naam.pdf:`.
 * Elk deel wordt apart gecodeerd; de `/` ertussen moet blijven staan.
 */
export function bestandPadInMap(driveId: string, mapItemId: string, delen: string[], bestandsnaam: string): string {
  const pad = [...delen, bestandsnaam].map(encodeURIComponent).join('/')
  return `/drives/${driveId}/items/${mapItemId}:/${pad}:`
}
