import type { Meetstaat, MeetregelAggregaat } from './types'

// ─── WAT MOET ER NOG NAAR DE CALCULATIE ──────────────────────────────────────

/**
 * De aggregaten die bij de volgende verwerking iets in de calculatie veranderen.
 *
 * Ook een code die naar 0 is gezakt (alle regels weg, of de code van de regels
 * gewijzigd) en al een calculatieregel heeft: die regel moet naar 0. Werd zo'n
 * aggregaat overgeslagen, dan bleef de calculatieregel op zijn oude hoeveelheid
 * staan en ging geschrapt werk mee in de offerte.
 *
 * Een 0-aggregaat zonder calculatieregel heeft niets te doen.
 */
export function teVerwerken(aggregaten: MeetregelAggregaat[]): MeetregelAggregaat[] {
  return aggregaten.filter(a =>
    !a.is_gesynchroniseerd && (a.totaal_hoeveelheid > 0 || !!a.calculatieregel_id)
  )
}

/** Gezakt naar 0 terwijl er een calculatieregel aan hangt. */
export function isVervallen(a: MeetregelAggregaat): boolean {
  return a.totaal_hoeveelheid <= 0 && !!a.calculatieregel_id
}

/**
 * De status die de meetstaat hoort te hebben. 'gesynchroniseerd' werd bij het
 * verwerken gezet en daarna nooit meer teruggezet, zodat het label groen bleef
 * terwijl er wijzigingen openstonden. Staat er iets open, dan is het weer 'concept'.
 */
export function meetstaatStatus(huidig: Meetstaat['status'], aantalOpen: number): Meetstaat['status'] {
  return huidig === 'gesynchroniseerd' && aantalOpen > 0 ? 'concept' : huidig
}
