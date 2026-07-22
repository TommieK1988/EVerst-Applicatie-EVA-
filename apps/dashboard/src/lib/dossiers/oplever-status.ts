import type { OpleverPuntStatus } from '@everts/database'

/**
 * Statusmachine van een opleverpunt.
 *
 * Staat bewust in een gewone module en niet in `oplevering.ts`: die is `'use server'`, en de
 * mobiele schermen hebben deze tabel client-side nodig om alléén de knoppen te tonen die vanuit
 * de huidige status zijn toegestaan. Zonder gedeelde tabel zou de UI een tweede, stilletjes
 * afwijkende kopie krijgen — en dan tik je op een knop die de server vervolgens weigert.
 */

/**
 * Toegestane transities (domein: Open → In behandeling → Opgelost → Geaccepteerd | Geweigerd).
 *
 * `nieuw` is de triage-ingang voor punten uit een formulier: de projectleider zet ze op de lijst
 * (`open`) of wijst ze af. `afgewezen` is terminaal, op ongedaan maken na.
 */
export const PUNT_TRANSITIES: Record<OpleverPuntStatus, OpleverPuntStatus[]> = {
  nieuw:          ['open', 'afgewezen'],
  open:           ['in_behandeling', 'opgelost', 'geaccepteerd'],
  in_behandeling: ['open', 'opgelost', 'geaccepteerd'],
  opgelost:       ['geaccepteerd', 'geweigerd', 'in_behandeling'],
  geaccepteerd:   ['in_behandeling'],
  geweigerd:      ['open', 'in_behandeling', 'opgelost'],
  afgewezen:      ['nieuw', 'open'],
}

/** Statussen die niet meetellen als werk: nog te beoordelen, of beoordeeld en afgevallen. */
export const NIET_ACTIEVE_STATUSSEN: OpleverPuntStatus[] = ['nieuw', 'afgewezen']

/**
 * Statussen die alleen via triage worden gezet. Ze horen niet tussen de gewone statusknoppen:
 * een punt "terug naar nieuw" zetten halverwege het werk is geen bedoelde handeling.
 */
export const TRIAGE_STATUSSEN: OpleverPuntStatus[] = ['nieuw', 'afgewezen']
