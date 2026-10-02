/**
 * De talen waarin EVA Mobiel (`/m`) te gebruiken is.
 *
 * Alleen de app op de telefoon is meertalig; het kantoordeel blijft Nederlands.
 * De taal hangt aan de medewerker (`medewerkers.taal`), niet aan de URL: `/m/planning`
 * is in elke taal hetzelfde pad. Zie docs/plan-meertaligheid-app.md.
 *
 * Dit bestand is bewust vrij van server- en React-code, zodat het overal te importeren is.
 */

export const TALEN = ['nl', 'pl', 'ta'] as const
export type Taal = (typeof TALEN)[number]

export const STANDAARD_TAAL: Taal = 'nl'

export function isTaal(waarde: unknown): waarde is Taal {
  return typeof waarde === 'string' && (TALEN as readonly string[]).includes(waarde)
}

/** Valt terug op Nederlands bij een onbekende of lege waarde. */
export function naarTaal(waarde: unknown): Taal {
  return isTaal(waarde) ? waarde : STANDAARD_TAAL
}

/**
 * De locale voor datums en getallen (`toLocaleDateString`, `Intl.NumberFormat`).
 * `ta-LK` = Tamil zoals in Sri Lanka; browsers tonen daar westerse cijfers, net als
 * in het dagelijks gebruik daar.
 */
export const LOCALE: Record<Taal, string> = {
  nl: 'nl-NL',
  pl: 'pl-PL',
  ta: 'ta-LK',
}

/** Naam van de taal in die taal zelf — zo herkent iedereen zijn eigen taal in de keuzelijst. */
export const TAAL_NAAM: Record<Taal, string> = {
  nl: 'Nederlands',
  pl: 'Polski',
  ta: 'தமிழ்',
}

/** Nederlandse naam, voor het kantoorscherm. */
export const TAAL_NAAM_NL: Record<Taal, string> = {
  nl: 'Nederlands',
  pl: 'Pools',
  ta: 'Tamil',
}

/** Tijdzone van alle datums in EVA; meegegeven aan next-intl zodat server en telefoon gelijk lopen. */
export const TIJDZONE = 'Europe/Amsterdam'
