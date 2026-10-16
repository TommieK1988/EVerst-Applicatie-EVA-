/**
 * De fase volgt de stap, niet andersom.
 *
 * Het offertebord had zeven kolommen, waarvan twee ("Actie" = `nabellen`, "Wachten" =
 * `in_behandeling`) hetzelfde zeiden als de volgende stap op de bewakingskaart. Die twee liepen
 * uit elkaar: "Geen gehoor" liet de fase staan, dus stond een kaart in de kolom Wachten met een
 * rode stip "actie verlopen". Op het bord zijn ze nu samen "In gesprek"; deze functie houdt de
 * onderliggende waarde gelijk met de stap, zodat rapportages en de Bouw7-spiegel niet liegen.
 *
 * Pure functie, bewust zonder databasewerk, zodat hij te testen is.
 */

import type { StapSoort } from './types'

/** Fases waar de stap de fase niet meer bepaalt: daar is een bewuste keuze gemaakt. */
const VAST = new Set(['mondelinge_toezegging', 'gewonnen', 'verloren', 'vervallen'])

/**
 * @param huidig    de huidige `offerte_substatus` van het dossier
 * @param gevraagd  de fase die de uitkomst zelf meegeeft (`UitkomstDefinitie.fase`), of null
 * @param stapSoort de stap die net is vastgelegd
 * @returns de fase die het dossier moet krijgen, of null als hij moet blijven staan
 */
export function faseNaStap(
  huidig: string | null,
  gevraagd: string | null,
  stapSoort: StapSoort | null,
): string | null {
  // Een uitkomst die een eindfase of mondeling akkoord kiest, wint altijd.
  if (gevraagd && VAST.has(gevraagd)) return gevraagd === huidig ? null : gevraagd

  // Mondeling akkoord zakt niet terug naar "in gesprek" omdat er een vervolgstap komt: het
  // rondmaken van de opdracht ís die vervolgstap.
  if (huidig && VAST.has(huidig)) return null

  // Alleen de lopende ladder volgt de stap. Concept en dergelijke laten we met rust.
  if (huidig !== null && huidig !== 'verzonden' && huidig !== 'nabellen' && huidig !== 'in_behandeling') {
    return null
  }
  if (!stapSoort) return null

  const doel = stapSoort === 'actie' ? 'nabellen' : 'in_behandeling'
  return doel === huidig ? null : doel
}
