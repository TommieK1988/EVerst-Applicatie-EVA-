import type { Meetstaat, MeetregelAggregaat } from './types'

// ─── WAT MOET ER NOG NAAR DE CALCULATIE ──────────────────────────────────────

// Verschillen kleiner dan een halve honderdste zijn afronding, geen wijziging.
export const MARGE = 0.005

/**
 * De aggregaten waarvan de calculatie afwijkt van de meetstaat, en die bij de
 * volgende verwerking dus iets veranderen.
 *
 * Bewust vergeleken met wat er écht in de calculatie staat, niet met de vlag
 * `is_gesynchroniseerd`. Die vlag liep uit de pas: verwijderde de calculator een
 * regel in de calculatie, dan stond de code nog als verwerkt en kon je hem niet
 * opnieuw doorzetten.
 *
 * - Code met hoeveelheid, geen (bestaande) calculatieregel → nieuw.
 * - Code met hoeveelheid, calculatieregel met een andere hoeveelheid → gewijzigd.
 *   Ook als de calculator die hoeveelheid zelf aanpaste: dan zie je het verschil.
 * - Code op 0, calculatieregel nog niet op 0 → vervallen. Niet als een andere,
 *   actieve code naar dezelfde regel wijst: anders overschrijft de 0 die code.
 */
export function teVerwerken(
  aggregaten: MeetregelAggregaat[], hoeveelheidPerRegel: ReadonlyMap<string, number>,
): MeetregelAggregaat[] {
  const inGebruik = new Set(
    aggregaten.filter(a => a.totaal_hoeveelheid > 0 && a.calculatieregel_id).map(a => a.calculatieregel_id)
  )
  return aggregaten.filter(a => {
    const id = a.calculatieregel_id
    const nu = id !== undefined ? hoeveelheidPerRegel.get(id) : undefined
    if (a.totaal_hoeveelheid > 0) return nu === undefined || Math.abs(nu - a.totaal_hoeveelheid) >= MARGE
    return !!id && nu !== undefined && Math.abs(nu) >= MARGE && !inGebruik.has(id)
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
