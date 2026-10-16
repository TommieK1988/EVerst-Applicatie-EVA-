/**
 * calculatie-opslag.ts — De opslag van een calculatie en de regels die ervan afwijken.
 *
 * Een nieuwe calculatie begint met de standaardopslag uit de calculatie-instellingen.
 * Een regel (of een norm) zonder eigen `opslag_pct` volgt de opslag van de calculatie;
 * met een eigen percentage blijft hij staan als de opslag van de calculatie wijzigt,
 * tenzij de calculator kiest om alle regels mee te nemen.
 */

import type { Calculatieregel, Componentregel } from './types'

/** Opslag van een nieuwe calculatie als er in de instellingen niets is ingevuld. */
export const STANDAARD_OPSLAG_PCT = 25

/** De ingestelde standaardopslag, of 25% als er niets (geldigs) staat. */
export function geldigeStandaardOpslag(ingesteld: number | undefined | null): number {
  return typeof ingesteld === 'number' && Number.isFinite(ingesteld) && ingesteld >= 0
    ? ingesteld
    : STANDAARD_OPSLAG_PCT
}

export interface EigenOpslag {
  /** Aantal regels met een eigen opslag op de regel zelf of op een van zijn normen. */
  aantal: number
  /** De verschillende eigen percentages, oplopend. */
  percentages: number[]
}

/** Welke regels hebben een eigen opslag, en welke percentages zijn dat? */
export function eigenOpslagen(
  regels: Pick<Calculatieregel, 'id' | 'opslag_pct'>[],
  componenten: Pick<Componentregel, 'calculatieregel_id' | 'opslag_pct'>[],
): EigenOpslag {
  const regelIds = new Set<string>()
  const pcts = new Set<number>()
  const neem = (id: string, pct: number | undefined) => {
    if (pct === undefined || pct === null) return
    regelIds.add(id)
    pcts.add(Math.round(pct * 100) / 100)
  }
  regels.forEach(r => neem(r.id, r.opslag_pct))
  componenten.forEach(c => neem(c.calculatieregel_id, c.opslag_pct))
  return { aantal: regelIds.size, percentages: [...pcts].sort((a, b) => a - b) }
}
