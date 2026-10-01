import type { Naamruimte } from './berichten'

/**
 * Naamruimtes die ook búíten `/m` nodig zijn: componenten die zowel in de app als op het
 * kantoorscherm draaien (formulieren invullen, werkbon, toolbox, handboek, dialogen).
 * De root-layout geeft alleen deze — in het Nederlands — mee, zodat het kantoordeel niet
 * de berichten van de hele app in elke pagina meestuurt. In `/m` komen alle naamruimtes
 * in de taal van de medewerker.
 *
 * Gebruikt een gedeeld component een nieuwe naamruimte, zet hem dan hier bij — anders
 * toont het kantoorscherm de sleutel in plaats van de tekst.
 */
export const GEDEELDE_NAAMRUIMTES = [
  'gedeeld', 'dialogen', 'formulieren', 'werkbon', 'toolbox', 'handboek', 'vertalen',
] as const satisfies readonly Naamruimte[]
