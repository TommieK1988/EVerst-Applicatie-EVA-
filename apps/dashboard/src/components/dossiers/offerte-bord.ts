/**
 * De vier kolommen van het offertebord.
 *
 * Het bord had zeven kolommen, één per `offerte_substatus`. Twee daarvan ("Actie" = `nabellen` en
 * "Wachten" = `in_behandeling`) zeiden hetzelfde als de volgende stap op de bewakingskaart, en
 * liepen daar regelmatig mee uit de pas. Wie er aan zet is, zegt nu alleen de stip op de kaart;
 * het bord toont de commerciële fase. Afgesloten bundelt de terugblik op gewonnen, verloren en
 * vervallen offertes van de afgelopen dagen.
 *
 * De databasewaarden blijven ongewijzigd: dit is alleen de indeling op het scherm. De lijst en de
 * statuskiezer op het Informatie-tab werken nog met de losse substatussen.
 */

import type { StatusDef } from './types'

export type OfferteBordKolom = 'verzonden' | 'in_gesprek' | 'mondelinge_toezegging' | 'afgesloten'

export const OFFERTE_BORD_KOLOMMEN: StatusDef<OfferteBordKolom>[] = [
  { key: 'verzonden',             label: 'Verzonden' },
  { key: 'in_gesprek',            label: 'In gesprek' },
  { key: 'mondelinge_toezegging', label: 'Mondeling akkoord' },
  { key: 'afgesloten',            label: 'Afgesloten' },
]

/** In welke kolom hoort een substatus? Onbekende waarden komen ongewijzigd terug. */
export function offerteBordKolom(substatus: string): string {
  if (substatus === 'nabellen' || substatus === 'in_behandeling') return 'in_gesprek'
  if (substatus === 'gewonnen' || substatus === 'verloren' || substatus === 'vervallen') return 'afgesloten'
  return substatus
}

/** De afsluitingen waaruit je kiest als je een kaart op Afgesloten laat vallen. */
export const AFSLUIT_KEUZES = [
  { key: 'gewonnen',  label: 'Gewonnen',  uitleg: 'De offerte wordt een opdracht.' },
  { key: 'verloren',  label: 'Verloren',  uitleg: 'Een ander doet het werk.' },
  { key: 'vervallen', label: 'Vervallen', uitleg: 'Het werk gaat niet door.' },
] as const

/**
 * Welke substatus hoort bij een kolom als je er een kaart in laat vallen? `null` bij Afgesloten:
 * daar moet de gebruiker eerst kiezen hoe hij afsluit.
 *
 * In gesprek wordt `nabellen`: wie een kaart met de hand uit Verzonden trekt, heeft nog geen
 * stap vastgelegd en is dus zelf aan zet. Legt hij daarna een uitkomst vast, dan zet
 * `faseNaStap` hem vanzelf goed.
 */
export function offerteBordDoel(kolom: string): string | null {
  if (kolom === 'in_gesprek') return 'nabellen'
  if (kolom === 'afgesloten') return null
  return kolom
}
