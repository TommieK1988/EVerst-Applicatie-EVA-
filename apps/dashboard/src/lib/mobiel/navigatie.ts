/**
 * Welke navigatie-app de Navigeren-knoppen in EVA Mobiel openen.
 *
 * Een keuze per toestel (localStorage), geen medewerkergegeven: op een iPhone wil je
 * misschien Apple Kaarten, op je Android-werktelefoon Waze. Zonder keuze blijft het
 * Google Maps — wat de knoppen altijd al deden.
 *
 * Alle drie zijn gewone https-links (universal/app links): staat de app erop, dan opent
 * die met de route klaar; staat hij er niet op, dan opent de website. Een eigen schema
 * als `waze://` zou zonder app op een foutmelding uitkomen.
 *
 * Client-veilig: geen `server-only`, geen imports.
 */

export const NAVIGATIE_APPS = ['google', 'apple', 'waze'] as const
export type NavigatieApp = (typeof NAVIGATIE_APPS)[number]

export const STANDAARD_NAVIGATIE_APP: NavigatieApp = 'google'

/** Sleutel in localStorage. */
export const NAVIGATIE_APP_KEY = 'eva.navigatieApp'

/** Productnamen; worden niet vertaald. */
export const NAVIGATIE_APP_NAAM: Record<NavigatieApp, string> = {
  google: 'Google Maps',
  apple: 'Apple Kaarten',
  waze: 'Waze',
}

export function isNavigatieApp(waarde: unknown): waarde is NavigatieApp {
  return typeof waarde === 'string' && (NAVIGATIE_APPS as readonly string[]).includes(waarde)
}

/** Link die de gekozen app opent met een route naar `adres`. */
export function navigatieLink(adres: string, app: NavigatieApp = STANDAARD_NAVIGATIE_APP): string {
  const doel = encodeURIComponent(adres)
  switch (app) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${doel}`
    case 'waze':
      return `https://waze.com/ul?q=${doel}&navigate=yes`
    case 'google':
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${doel}`
  }
}

/** De bewaarde keuze op dit toestel; valt terug op Google Maps. */
export function leesNavigatieApp(): NavigatieApp {
  try {
    const waarde = localStorage.getItem(NAVIGATIE_APP_KEY)
    return isNavigatieApp(waarde) ? waarde : STANDAARD_NAVIGATIE_APP
  } catch {
    return STANDAARD_NAVIGATIE_APP
  }
}

export function bewaarNavigatieApp(app: NavigatieApp): void {
  try {
    localStorage.setItem(NAVIGATIE_APP_KEY, app)
  } catch {
    /* private mode — negeren */
  }
}
