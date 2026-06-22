/**
 * Bouwt de weergavenaam van een medewerker op uit voornaam/tussenvoegsel/achternaam.
 * Gelijk aan `medNaam` in `@/lib/dossiers/actions`, zodat de naam exact matcht met de
 * rolnamen (projectleider_naam, calculator_naam, …) waarop de personen-slicer filtert.
 */
export function medewerkerNaam(
  med: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null } | null,
): string | null {
  if (!med) return null
  return [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') || null
}
