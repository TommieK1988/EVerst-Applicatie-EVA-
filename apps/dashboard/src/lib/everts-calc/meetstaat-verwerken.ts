import type { Meetstaat, MeetregelAggregaat } from './types'

// ─── WAT MOET ER NOG NAAR DE CALCULATIE ──────────────────────────────────────

/**
 * De aggregaten die bij de volgende verwerking iets in de calculatie veranderen.
 *
 * Ook een code die naar 0 is gezakt (alle regels weg, of de code van de regels
 * gewijzigd): zijn calculatieregel moet naar 0. Werd zo'n aggregaat overgeslagen,
 * dan bleef de calculatieregel op zijn oude hoeveelheid staan en ging geschrapt
 * werk mee in de offerte. Maar alleen als dat echt iets verandert:
 *
 * - de calculatieregel bestaat nog (`regelIds`); een regel die de calculator al
 *   verwijderde is geen wijziging, alleen ruis in de teller;
 * - geen andere, actieve code wijst naar dezelfde calculatieregel; anders zou de
 *   0 de hoeveelheid van die code overschrijven.
 */
export function teVerwerken(
  aggregaten: MeetregelAggregaat[], regelIds?: ReadonlySet<string>,
): MeetregelAggregaat[] {
  const inGebruik = new Set(
    aggregaten.filter(a => a.totaal_hoeveelheid > 0 && a.calculatieregel_id).map(a => a.calculatieregel_id)
  )
  return aggregaten.filter(a => {
    if (a.is_gesynchroniseerd) return false
    if (a.totaal_hoeveelheid > 0) return true
    const id = a.calculatieregel_id
    return !!id && !inGebruik.has(id) && (!regelIds || regelIds.has(id))
  })
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
