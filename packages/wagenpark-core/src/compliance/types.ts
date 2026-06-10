import type {
  ComplianceBevindingInput,
  HandboekRegel,
  UluTrip,
  Voertuig,
} from '../types'

/** Beperkte shape van ulu_users — alleen wat regels nodig hebben. */
export type UluUserInfo = {
  id: number
  volledige_naam: string | null
  bijtelling_betaald: boolean
  prive_limiet_km_jaar: number | null
  zakelijk_verwacht_km_jaar: number | null
  /** Verwachte start-tijd werkdag, "HH:MM". Null = regel niet van toepassing. */
  werktijd_start: string | null
  /** Verwachte eind-tijd werkdag, "HH:MM". */
  werktijd_eind: string | null
}

/**
 * Input voor een compliance-check. Bevat alle context die een regel
 * mogelijk nodig heeft.
 */
export type ComplianceContext = {
  /** De te toetsen periode (YYYY-MM-DD). */
  periodeStart: string
  periodeEind: string
  /** Trips in deze periode (reeds gekoppeld aan voertuig/medewerker). */
  trips: UluTrip[]
  /** Voertuigen in scope, geïndexeerd op id. */
  voertuigen: Map<string, Voertuig>
  /** ULU-bestuurders, geïndexeerd op ulu user_id. Optioneel (oude sync-data). */
  uluUsers?: Map<number, UluUserInfo>
  /** Actieve regels uit de DB. */
  regels: Map<string, HandboekRegel>
}

export type RuleRunner = (ctx: ComplianceContext) => ComplianceBevindingInput[]

export type RuleModule = {
  code: string
  runner: RuleRunner
}
