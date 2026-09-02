import type { OpleverPuntStatus } from '@everts/database'

/**
 * Statussen van een opleverpunt/aandachtspunt, in de volgorde waarin ze in keuzelijsten horen.
 *
 * Staat bewust in een gewone module en niet in `oplevering.ts`: die is `'use server'`, en de
 * mobiele schermen hebben deze lijst client-side nodig om de statusknoppen te tonen. Zonder
 * gedeelde lijst zou de UI een tweede, stilletjes afwijkende kopie krijgen.
 *
 * Er is bewust géén statusmachine meer: elke status mag naar elke andere. Een vaste volgorde
 * afdwingen ("eerst in behandeling, dan opgelost") botste in de praktijk te vaak — een punt dat
 * per ongeluk op geaccepteerd stond kon niet meer terug naar open, en een afgewezen melding niet
 * rechtstreeks op de lijst. De projectleider bepaalt zelf wat de juiste stand is.
 */
export const PUNT_STATUSSEN: OpleverPuntStatus[] = [
  'nieuw', 'open', 'in_behandeling', 'opgelost', 'geaccepteerd', 'geweigerd', 'afgewezen',
]

/** Statussen die niet meetellen als werk: nog te beoordelen, of beoordeeld en afgevallen. */
export const NIET_ACTIEVE_STATUSSEN: OpleverPuntStatus[] = ['nieuw', 'afgewezen']

/** Statussen waarbij een reden hoort — die vragen we uit vóór de wijziging. */
export const REDEN_STATUSSEN: OpleverPuntStatus[] = ['geweigerd', 'afgewezen']
