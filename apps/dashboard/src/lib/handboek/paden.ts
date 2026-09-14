/**
 * Links naar handboek-schermen. Puur en op één plek, omdat situaties een
 * prefix in hun slug dragen en die anders overal apart weggewerkt wordt.
 *
 * Waarom de prefix er is: `slug` is uniek over de hele tabel, en er bestaat
 * zowel een hóófdstuk "Verlof" als een situatie "Verlof". Zonder prefix zouden
 * die elkaar in de weg zitten. In de URL hoeft hij niet: daar zit de situatie
 * al in een eigen map.
 */
import type { SectieSoort } from './types'

export const SITUATIE_PREFIX = 'situatie-'

/** De slug zoals hij in de URL staat (zonder prefix). */
export function urlSlug(dbSlug: string): string {
  return dbSlug.startsWith(SITUATIE_PREFIX) ? dbSlug.slice(SITUATIE_PREFIX.length) : dbSlug
}

/** De slug zoals hij in de database staat. */
export function dbSlug(urlDeel: string, soort: SectieSoort): string {
  return soort === 'situatie' ? SITUATIE_PREFIX + urlDeel : urlDeel
}

/** Link naar een hoofdstuk of situatie, eventueel met zoekterm en blok-anker. */
export function sectiePad(
  sectie: { slug: string; soort: SectieSoort },
  opties?: { vraag?: string; blokId?: string },
): string {
  const basis =
    sectie.soort === 'situatie'
      ? `/m/handboek/situatie/${urlSlug(sectie.slug)}`
      : `/m/handboek/${sectie.slug}`
  const query = opties?.vraag ? `?q=${encodeURIComponent(opties.vraag)}` : ''
  const anker = opties?.blokId ? `#blok-${opties.blokId}` : ''
  return basis + query + anker
}
