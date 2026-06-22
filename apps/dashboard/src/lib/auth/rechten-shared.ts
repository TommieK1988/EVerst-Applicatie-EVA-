/**
 * Pure, client-veilige rechten-helpers (géén 'server-only').
 * Gedeeld door de Sidebar (client) en de server-helpers in ./rechten.ts.
 */
import type { ModuleRechten, RechtenModule, RechtenSet } from '@everts/database/platform-types'

const NIVEAU_RANG: Record<ModuleRechten, number> = { lezen: 1, schrijven: 2, beheren: 3 }

/**
 * Onderdelen waarvoor de toegang nu daadwerkelijk wordt afgedwongen
 * (sidebar verbergen + route-guard). Uitrollen = key toevoegen.
 */
export const AFGEDWONGEN_MODULES: RechtenModule[] = ['management', 'mijn_taken']

/** Een 'instellingen = beheren'-gebruiker is beheerder en ziet/opent alles. */
export function isBeheerder(rechten: RechtenSet): boolean {
  return rechten.instellingen === 'beheren'
}

/** Heeft de gebruiker minimaal `min`-niveau op `module`? */
export function heeftModuleToegang(
  rechten: RechtenSet,
  module: RechtenModule,
  min: ModuleRechten = 'lezen',
): boolean {
  if (isBeheerder(rechten)) return true
  const niveau = rechten[module]
  if (!niveau) return false
  return NIVEAU_RANG[niveau] >= NIVEAU_RANG[min]
}

/**
 * Mag dit onderdeel getoond worden? Onderdelen zonder module of die (nog) niet
 * worden afgedwongen, zijn altijd zichtbaar — alleen `AFGEDWONGEN_MODULES`
 * wordt op rechten gecontroleerd.
 */
export function magOnderdeelZien(
  rechten: RechtenSet,
  module: RechtenModule | undefined,
  min: ModuleRechten = 'lezen',
): boolean {
  if (!module) return true
  if (!AFGEDWONGEN_MODULES.includes(module)) return true
  return heeftModuleToegang(rechten, module, min)
}
