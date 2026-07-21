/**
 * Indeling van de compliance-regels naar de plek waar hun signalen thuishoren.
 *
 * De regels vallen uiteen in drie soorten, en die bepaalt wáár je een signaal
 * afhandelt:
 *
 *  - **Rit-gebonden** (R1 werktijden, R3 buitenland, R7 weekend-markering,
 *    R9 te laat, R10 te vroeg, R11 werktijd-analyse) — gaan over één rit en
 *    staan in de signaal-kolom op /wagenpark/ritten.
 *  - **Persoonlijk** (R2a/R2b privé-km, R6 rijgedrag) — gaan over een bestuurder
 *    over een periode en staan op de bestuurderspagina.
 *  - **Parkeren** (R8) — hangen aan een parkeer-record of aan een maandtotaal
 *    per bestuurder; staan op de bestuurderspagina en de parkeren-pagina.
 *
 * Indelen op `regel_code` en niet op `trip_id is null`: R6 zet soms wél een
 * trip_id (de rit die de week-aggregatie triggerde), maar blijft een
 * persoonlijk signaal. Zou je op trip_id splitsen, dan dook dezelfde bevinding
 * op twee plekken op.
 */

/** Regels die over een bestuurder gaan in plaats van over één rit. */
export const PERSOONLIJKE_REGELS = ['R2a', 'R2b', 'R6'] as const

/** Regels over parkeren. */
export const PARKEER_REGELS = ['R8'] as const

/** Alles wat niet persoonlijk of parkeren is, hoort bij de rit. */
export const NIET_RIT_REGELS: readonly string[] = [...PERSOONLIJKE_REGELS, ...PARKEER_REGELS]

const NIET_RIT_LIJST = NIET_RIT_REGELS.map((r) => `'${r}'`).join(', ')

/** SQL-fragment: `regel_code not in ('R2a', …)` — selecteert de rit-gebonden regels. */
export const RIT_REGELS_SQL = `not in (${NIET_RIT_LIJST})`

/** SQL-fragment: `regel_code in ('R2a', …)` — selecteert persoonlijke + parkeersignalen. */
export const NIET_RIT_REGELS_SQL = `in (${NIET_RIT_LIJST})`

export type SignaalSoort = 'rit' | 'persoonlijk' | 'parkeren'

export function signaalSoort(regel_code: string): SignaalSoort {
  if ((PARKEER_REGELS as readonly string[]).includes(regel_code)) return 'parkeren'
  if ((PERSOONLIJKE_REGELS as readonly string[]).includes(regel_code)) return 'persoonlijk'
  return 'rit'
}
