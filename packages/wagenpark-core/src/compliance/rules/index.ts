import type { RuleModule } from '../types'
import { R1 } from './R1-werktijden'
import { R2a, R2b } from './R2-prive-km'
import { R3 } from './R3-buitenland'
import { R6 } from './R6-rijgedrag'
import { R7 } from './R7-weekend-ulu-markering'
import { R9 } from './R9-te-laat'
import { R10 } from './R10-te-vroeg'

/** Alle registreerde regels die op trips werken. */
export const ALLE_REGELS: RuleModule[] = [R1, R2a, R2b, R3, R6, R7, R9, R10]

export { R1, R2a, R2b, R3, R6, R7, R9, R10 }
export { runParkingRule, type ParkingConfig, type ParkingRow } from './R8-parkeren'
