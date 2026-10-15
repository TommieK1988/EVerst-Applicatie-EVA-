/**
 * Welke navigatie-app de Navigeren-knoppen in EVA Mobiel openen.
 *
 * Een keuze per toestel (localStorage), geen medewerkergegeven: op een iPhone wil je
 * misschien Apple Kaarten, op je Android-werktelefoon Waze. Zonder keuze blijft het
 * Google Maps — wat de knoppen altijd al deden.
 *
 * Welke apps er op de telefoon staan kan een web-app niet zien. Op Android lossen we dat op
 * met `telefoon`: een `geo:`-link, waarop Android zijn eigen keuzelijst toont met álle
 * geïnstalleerde navigatie-apps. iOS kent zo'n keuzelijst niet; daar blijft het de vaste lijst.
 *
 * Google, Apple en Waze zijn gewone https-links (universal/app links): staat de app erop, dan
 * opent die met de route klaar, anders de website. Flitsmeister heeft geen gedocumenteerde
 * link; op Android sturen we een `geo:`-intent gericht aan de Flitsmeister-app, met Google
 * Maps als vangnet als die app er niet is of de link niet oppakt. Op iOS kan het niet.
 *
 * Client-veilig: geen `server-only`, geen imports.
 */

export const NAVIGATIE_APPS = ['telefoon', 'google', 'apple', 'waze', 'flitsmeister'] as const
export type NavigatieApp = (typeof NAVIGATIE_APPS)[number]

export const STANDAARD_NAVIGATIE_APP: NavigatieApp = 'google'

/** Alleen op Android te gebruiken: ze leunen op Android-intents. */
const ALLEEN_ANDROID: readonly NavigatieApp[] = ['telefoon', 'flitsmeister']

/** Sleutel in localStorage. */
export const NAVIGATIE_APP_KEY = 'eva.navigatieApp'

const FLITSMEISTER_PAKKET = 'nl.flitsmeister'

/** Productnamen; worden niet vertaald. `telefoon` is geen product en krijgt een vertaalde naam. */
export const NAVIGATIE_APP_NAAM: Record<Exclude<NavigatieApp, 'telefoon'>, string> = {
  google: 'Google Maps',
  apple: 'Apple Kaarten',
  waze: 'Waze',
  flitsmeister: 'Flitsmeister',
}

export function isNavigatieApp(waarde: unknown): waarde is NavigatieApp {
  return typeof waarde === 'string' && (NAVIGATIE_APPS as readonly string[]).includes(waarde)
}

export function isAndroid(): boolean {
  try {
    return /android/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

/** De apps die op dit soort toestel te kiezen zijn, in de volgorde van de instellingen. */
export function beschikbareNavigatieApps(android: boolean): NavigatieApp[] {
  return NAVIGATIE_APPS.filter((app) => android || !ALLEEN_ANDROID.includes(app))
}

/** Link die de gekozen app opent met een route naar `adres`. */
export function navigatieLink(adres: string, app: NavigatieApp = STANDAARD_NAVIGATIE_APP): string {
  const doel = encodeURIComponent(adres)
  const google = `https://www.google.com/maps/dir/?api=1&destination=${doel}`
  switch (app) {
    case 'telefoon':
      return `geo:0,0?q=${doel}`
    case 'flitsmeister':
      return `intent://0,0?q=${doel}#Intent;scheme=geo;package=${FLITSMEISTER_PAKKET};`
        + `S.browser_fallback_url=${encodeURIComponent(google)};end`
    case 'apple':
      return `https://maps.apple.com/?daddr=${doel}`
    case 'waze':
      return `https://waze.com/ul?q=${doel}&navigate=yes`
    case 'google':
    default:
      return google
  }
}

/** Opent de link de app zelf (geen website)? Dan geen nieuw tabblad, dat bleef leeg achter. */
export function opentApp(link: string): boolean {
  return !link.startsWith('https:')
}

/**
 * De bewaarde keuze op dit toestel; valt terug op Google Maps. Een Android-keuze op een
 * ander toestel (gedeelde browserdata) telt niet.
 */
export function leesNavigatieApp(): NavigatieApp {
  try {
    const waarde = localStorage.getItem(NAVIGATIE_APP_KEY)
    if (isNavigatieApp(waarde) && beschikbareNavigatieApps(isAndroid()).includes(waarde)) return waarde
  } catch {
    /* private mode — standaard */
  }
  return STANDAARD_NAVIGATIE_APP
}

export function bewaarNavigatieApp(app: NavigatieApp): void {
  try {
    localStorage.setItem(NAVIGATIE_APP_KEY, app)
  } catch {
    /* private mode — negeren */
  }
}
