import { addDays, addMonths, format, isWeekend, parseISO } from 'date-fns'

/**
 * Waar de deadline van een sjabloontaak aan hangt. Elke taak kiest zijn eigen anker.
 * - activatie           → moment waarop het sjabloon op het dossier werd gezet
 * - streefdatum         → datum die bij het handmatig activeren is ingetypt
 * - planning_start      → vroegste start van de detailplanning van het dossier
 * - planning_eind       → laatste eind van de detailplanning van het dossier
 * - verwacht_startdatum → verwachte startdatum van het dossier
 * - verwacht_einddatum  → verwachte einddatum van het dossier
 * - in_dienst_vanaf     → in-dienstdatum van de medewerker (medewerker-context)
 * - uit_dienst_per      → uit-dienstdatum van de medewerker (medewerker-context)
 */
export type DeadlineBasis =
  | 'geen'
  | 'activatie'
  | 'streefdatum'
  | 'planning_start'
  | 'planning_eind'
  | 'verwacht_startdatum'
  | 'verwacht_einddatum'
  | 'in_dienst_vanaf'
  | 'uit_dienst_per'

export type HerhalingInterval =
  | 'geen'
  | 'werkdagen'
  | 'wekelijks'
  | 'tweewekelijks'
  | 'maandelijks'

/** Ankers die pas bekend zijn zodra er detailplanning staat, en meebewegen als die schuift. */
export const PLANNING_BASISSEN: DeadlineBasis[] = ['planning_start', 'planning_eind']

export function isPlanningBasis(basis: string | null | undefined): boolean {
  return PLANNING_BASISSEN.includes(basis as DeadlineBasis)
}

/**
 * Ankers die na het activeren nog kunnen verschuiven en dus herberekend moeten worden.
 * 'activatie' hoort hier bewust niet bij: dat moment ligt voorgoed vast.
 */
export const HERBEREKENBARE_BASISSEN: DeadlineBasis[] = [
  'planning_start',
  'planning_eind',
  'streefdatum',
  'verwacht_startdatum',
  'verwacht_einddatum',
  'in_dienst_vanaf',
  'uit_dienst_per',
]

export const DEADLINE_BASIS_LABELS: Record<DeadlineBasis, string> = {
  geen:                'Geen automatische deadline',
  activatie:           'Datum van activeren',
  streefdatum:         'Streefdatum (ingevuld bij activeren)',
  planning_start:      'Start detailplanning',
  planning_eind:       'Einde detailplanning',
  verwacht_startdatum: 'Verwachte startdatum dossier',
  verwacht_einddatum:  'Verwachte einddatum dossier',
  in_dienst_vanaf:     'In dienst vanaf (medewerker)',
  uit_dienst_per:      'Uit dienst per (medewerker)',
}

/** Ankers die per sjabloon-context beschikbaar zijn (voor de deadline-dropdowns). */
export const DOSSIER_DEADLINE_BASISSEN: DeadlineBasis[] = [
  'geen', 'activatie', 'streefdatum', 'planning_start', 'planning_eind',
  'verwacht_startdatum', 'verwacht_einddatum',
]
export const MEDEWERKER_DEADLINE_BASISSEN: DeadlineBasis[] = [
  'geen', 'activatie', 'streefdatum', 'in_dienst_vanaf', 'uit_dienst_per',
]

/** Velden op het dossier die als anker kunnen dienen. */
export interface DossierDatumVelden {
  verwacht_startdatum?: string | null
  verwacht_einddatum?: string | null
}

export const HERHALING_LABELS: Record<HerhalingInterval, string> = {
  geen:          'Niet herhalen',
  werkdagen:     'Elke werkdag',
  wekelijks:     'Wekelijks',
  tweewekelijks: 'Elke twee weken',
  maandelijks:   'Maandelijks',
}

/** Het uitvoeringsvenster van een dossier volgens de detailplanning (yyyy-MM-dd). */
export interface PlanningVenster {
  start: string | null
  eind:  string | null
}

export interface DeadlineContext {
  /** yyyy-MM-dd — dag waarop het sjabloon geactiveerd werd. */
  activatiedatum: string
  streefdatum?: string | null
  planning_start?: string | null
  planning_eind?: string | null
  verwacht_startdatum?: string | null
  verwacht_einddatum?: string | null
  in_dienst_vanaf?: string | null
  uit_dienst_per?: string | null
}

function ankerDatum(basis: DeadlineBasis, ctx: DeadlineContext): string | null {
  switch (basis) {
    case 'activatie':           return ctx.activatiedatum
    case 'streefdatum':         return ctx.streefdatum         ?? null
    case 'planning_start':      return ctx.planning_start      ?? null
    case 'planning_eind':       return ctx.planning_eind       ?? null
    case 'verwacht_startdatum': return ctx.verwacht_startdatum ?? null
    case 'verwacht_einddatum':  return ctx.verwacht_einddatum  ?? null
    case 'in_dienst_vanaf':     return ctx.in_dienst_vanaf     ?? null
    case 'uit_dienst_per':      return ctx.uit_dienst_per      ?? null
    default:                    return null
  }
}

/**
 * Deadline = ankerdatum + dagen. `dagen` is ondertekend: negatief telt terug.
 * Null wanneer er geen anker is of het anker (nog) onbekend is — bv. een taak die
 * aan de detailplanning hangt terwijl er nog niets ingepland staat.
 */
export function berekenDeadline(
  basis: DeadlineBasis | string | null | undefined,
  dagen: number | null | undefined,
  ctx: DeadlineContext,
): string | null {
  if (!basis || basis === 'geen') return null
  const anker = ankerDatum(basis as DeadlineBasis, ctx)
  if (!anker) return null
  // parseISO + format blijven in de lokale tijdzone; toISOString zou een dag
  // kunnen verschuiven en is voor kale kalenderdagen dus niet bruikbaar.
  return format(addDays(parseISO(anker), dagen ?? 0), 'yyyy-MM-dd')
}

/**
 * Bovengrens op het aantal herhalingen dat we genereren. Een uitvoering van twee jaar
 * op 'werkdagen' zou ruim 500 taken opleveren; dat is vrijwel zeker een vergissing.
 * Bij afkappen meldt de aanroeper dit — stilzwijgend minder taken maken zou lezen
 * als "dit is de hele reeks".
 */
export const MAX_HERHALINGEN = 200

/**
 * De datums waarop een herhalende taak moet vallen, binnen het uitvoeringsvenster
 * (start t/m eind, beide inclusief). Lege lijst als het venster onbekend is.
 */
export function herhalingsDatums(
  interval: HerhalingInterval | string | null | undefined,
  start: string | null | undefined,
  eind: string | null | undefined,
): string[] {
  if (!interval || interval === 'geen' || !start || !eind) return []

  const eersteDag = parseISO(start)
  const laatsteDag = parseISO(eind)
  if (laatsteDag < eersteDag) return []

  const datums: string[] = []
  let cursor = eersteDag
  let n = 0

  while (cursor <= laatsteDag && datums.length < MAX_HERHALINGEN) {
    if (interval !== 'werkdagen' || !isWeekend(cursor)) {
      datums.push(format(cursor, 'yyyy-MM-dd'))
    }
    n += 1
    switch (interval) {
      case 'werkdagen':     cursor = addDays(eersteDag, n); break
      case 'wekelijks':     cursor = addDays(eersteDag, n * 7); break
      case 'tweewekelijks': cursor = addDays(eersteDag, n * 14); break
      case 'maandelijks':   cursor = addMonths(eersteDag, n); break
      default:              return datums
    }
  }

  return datums
}
