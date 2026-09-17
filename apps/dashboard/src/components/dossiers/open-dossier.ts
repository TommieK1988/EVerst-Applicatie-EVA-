import type { DossierSectie } from './types'

/** Route-segment per sectie — één plek zodat kanban, lijst en popups niet uit elkaar lopen. */
export const SECTIE_ROUTE: Record<DossierSectie, string> = {
  aanvraag:    'aanvragen',
  offerte:     'offertes',
  opdracht:    'opdrachten',
  servicedesk: 'servicedesk',
}

/**
 * Pad naar één tabblad van een dossier, bv. `/offertes/<id>/bewaking`.
 *
 * Gebruik dit wanneer je ergens anders dan op Informatie wilt uitkomen. Plak nooit zelf een
 * tab achter `dossierPad()`: die geeft het Informatie-tabblad terug, dus dat levert
 * `/offertes/<id>/informatie/bewaking` op — een 404 die er in code correct uitziet.
 */
export function dossierTabPad(sectie: DossierSectie, id: string, tab: string): string {
  return `/${SECTIE_ROUTE[sectie]}/${id}/${tab}`
}

/** Pad naar het Informatie-tabblad van een dossier. */
export function dossierPad(sectie: DossierSectie, id: string): string {
  return dossierTabPad(sectie, id, 'informatie')
}

/**
 * Pad waar je uitkomt als je een dossier **vanaf een overzicht** aanklikt (bord, lijst, popup).
 *
 * Voor een offerte is dat **Bewaking** en niet Informatie. Wie vanaf het offertebord een dossier
 * opent, doet dat om het commercieel op te volgen: wat is de stand, wie is aan zet, wanneer
 * bellen we. Die vraag staat op Bewaking; op Informatie staan de projectgegevens, die in deze
 * fase zelden nodig zijn. Elders blijft Informatie de logische landingsplek.
 *
 * Bewust een aparte functie en niet een andere uitkomst van `dossierPad()`: die wordt óók
 * gebruikt om meldings-URL's te bouwen, waarbij het `/informatie`-segment door een ander
 * tabblad wordt vervangen (`lib/portaal/meldingen.ts`). Die vervanging zou stilletjes niets
 * doen zodra het laatste segment ineens `bewaking` heet.
 */
export function dossierOpenPad(sectie: DossierSectie, id: string): string {
  return dossierTabPad(sectie, id, sectie === 'offerte' ? 'bewaking' : 'informatie')
}

/**
 * Opent een dossier standaard in een **nieuw browsertabblad**, zodat het overzicht
 * (filters, slicers, scrollpositie, kanban-stand) blijft staan en er meerdere
 * dossiers naast elkaar open kunnen.
 *
 * Bewust via een tijdelijk <a target="_blank"> in plaats van `window.open(...)`:
 * dat gedraagt zich exact als een gewone link — dus altijd een tabblad (nooit een
 * popup-venster) en het wordt niet door popup-blokkers tegengehouden.
 */
/**
 * Wijst dit pad naar een dossier-detailpagina (bv. `/opdrachten/<id>/meerwerk`)?
 * Voor plekken met een vrij opgeslagen URL — notificaties, zoekresultaten — die
 * ook naar niet-dossierpagina's kan verwijzen.
 */
export function isDossierPad(pad: string): boolean {
  const delen = pad.split(/[?#]/)[0].split('/').filter(Boolean)
  return delen.length >= 2 && (Object.values(SECTIE_ROUTE) as string[]).includes(delen[0])
}

/**
 * Zelfde gedrag voor plekken die al een echte `<Link>`/`<a>` naar een dossier
 * renderen: `<Link href={…} {...NAAR_NIEUW_TABBLAD}>`. Daar hoeft geen
 * click-handler aan te pas te komen.
 */
export const NAAR_NIEUW_TABBLAD = { target: '_blank', rel: 'noopener noreferrer' } as const

export function openDossierInNieuwTabblad(pad: string) {
  if (typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = pad
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
