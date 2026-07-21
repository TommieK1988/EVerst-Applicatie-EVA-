import type {
  ComplianceBevindingInput,
  HandboekRegel,
  UluTrip,
  Voertuig,
} from '../types'
import type { AfwezigInfo, RoosterInfo } from './rules/werkdag'

/** Beperkte shape van ulu_users — alleen wat regels nodig hebben. */
export type UluUserInfo = {
  id: number
  volledige_naam: string | null
  bijtelling_betaald: boolean
  prive_limiet_km_jaar: number | null
  zakelijk_verwacht_km_jaar: number | null
  /** Koppeling naar public.medewerkers — nodig voor rooster en afwezigheid. */
  medewerker_id: string | null
  /**
   * Verwachte werktijden uit het bestuurderprofiel. Alleen terugval: het
   * rooster (medewerker_roosters) is leidend en veel bestuurders hebben deze
   * velden leeg staan.
   */
  werktijd_start: string | null
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
  /**
   * Werkroosters per medewerker_id, aflopend gesorteerd op geldig_vanaf.
   * Bepaalt welke dagen werkdagen zijn en wat de verwachte dagstart/dageind is
   * (R9/R10). Ontbreekt de map, dan vallen die regels terug op ulu_users.
   */
  roosters?: Map<string, RoosterInfo[]>
  /** Verlof en ander verzuim per medewerker_id — onderdrukt R9/R10 die dag. */
  afwezigheid?: Map<string, AfwezigInfo[]>
  /** Actieve regels uit de DB. */
  regels: Map<string, HandboekRegel>
}

export type RuleRunner = (ctx: ComplianceContext) => ComplianceBevindingInput[]

export type RuleModule = {
  code: string
  runner: RuleRunner
}
