/**
 * behandeling-label.ts
 *
 * De omschrijving van een calculatieregel met de gekoppelde schilderbehandeling
 * erachter: `Buitenkozijnen voorgevel – 2-laags dekkend`.
 *
 * Bewust afgeleid en nergens opgeslagen: de naam komt live uit de bibliotheek, net
 * als de behandelingstekst. Zou je hem in `omschrijving` wegschrijven, dan blijft
 * een oude naam achter zodra de bibliotheek wijzigt — precies de fout die het
 * bevriezen-bij-de-offerte moest oplossen.
 */

/** Middelstreep (en dash) met spaties eromheen. */
export const BEHANDELING_SCHEIDING = ' – '

/**
 * Het stuk dat áchter de eigen omschrijving hoort. Leeg als er geen behandeling
 * hangt of als de naam er al staat (handmatig ingetypt — niet dubbel plakken).
 *
 * Het grid toont dit los naast het invoerveld; zo blijft `omschrijving` puur de
 * tekst die de calculator zelf typte.
 */
export function behandelingSuffix(
  omschrijving: string | null | undefined,
  behandelingNaam: string | null | undefined,
): string {
  const basis = (omschrijving ?? '').trim()
  const naam = (behandelingNaam ?? '').trim()
  if (!naam) return ''
  if (basis.toLowerCase().endsWith(naam.toLowerCase())) return ''
  return basis ? BEHANDELING_SCHEIDING + naam : naam
}

/** De volledige regelomschrijving zoals hij in de offerte belandt. */
export function omschrijvingMetBehandeling(
  omschrijving: string | null | undefined,
  behandelingNaam: string | null | undefined,
): string {
  const basis = (omschrijving ?? '').trim()
  return basis + behandelingSuffix(basis, behandelingNaam)
}
