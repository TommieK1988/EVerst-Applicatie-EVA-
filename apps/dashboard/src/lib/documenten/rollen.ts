/**
 * rollen.ts — de zes projectrollen van een dossier.
 *
 * Client-veilig (geen server-only imports): zowel het variabelenpaneel in de
 * beheer-editor als de server-side contextbouwer gebruikt deze lijst, zodat de
 * getoonde tags en de gerenderde context niet uit elkaar kunnen lopen.
 *
 * De sleutels komen overeen met de embed-aliassen in `DOSSIER_SELECT`
 * (lib/everts-calc/offerte-bronnen.ts).
 */

export const ROLLEN = [
  'projectleider',
  'uitvoerder',
  'calculator',
  'werkvoorbereider',
  'teamleider',
  'controller',
] as const

export type RolNaam = (typeof ROLLEN)[number]

export const rolLabels: Record<RolNaam, string> = {
  projectleider:    'Projectleider',
  uitvoerder:       'Uitvoerder',
  calculator:       'Calculator',
  werkvoorbereider: 'Werkvoorbereider',
  teamleider:       'Teamleider',
  controller:       'Controller',
}
