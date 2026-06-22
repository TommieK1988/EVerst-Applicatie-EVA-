/**
 * Gedeelde mapping tussen Bouw7-projectstatus (nummerprefix in de naam, bv. "04. Onderhanden")
 * en de EVA opdracht-substatus. Single source of truth voor BEIDE richtingen:
 *  - lezen  (Bouw7 → EVA): `sync.ts` (`mapBouw7NaarEvaStatus`) gebruikt `OPDRACHT_PREFIX_NAAR_SUBSTATUS`.
 *  - schrijven (EVA → Bouw7): `lib/dossiers/bouw7-status.ts` gebruikt `opdrachtSubstatusNaarPrefix()`.
 *
 * Houd deze tabel leidend — niet apart dupliceren in de write-helper (anders ontstaat stille drift).
 */

import type { OpdrachtSubstatus } from '@everts/database'

/** Bouw7-projectstatus prefix → EVA opdracht-substatus (02 t/m 07). */
export const OPDRACHT_PREFIX_NAAR_SUBSTATUS: Record<string, OpdrachtSubstatus> = {
  '02.': 'nieuwe_opdracht',
  '03.': 'werkvoorbereiding',
  '04.': 'onderhanden',
  '05.': 'uitvoering_gereed',
  '06.': 'financieel_gereed',
  '07.': 'financieel_afgesloten',
}

/** Omgekeerd: EVA opdracht-substatus → Bouw7-prefix (voor terugschrijven). */
export const OPDRACHT_SUBSTATUS_NAAR_PREFIX: Record<OpdrachtSubstatus, string> = Object.fromEntries(
  Object.entries(OPDRACHT_PREFIX_NAAR_SUBSTATUS).map(([prefix, sub]) => [sub, prefix]),
) as Record<OpdrachtSubstatus, string>

/** Geeft de Bouw7-statusnaam-prefix voor een EVA opdracht-substatus, of null als die niet bestaat. */
export function opdrachtSubstatusNaarPrefix(substatus: string): string | null {
  return OPDRACHT_SUBSTATUS_NAAR_PREFIX[substatus as OpdrachtSubstatus] ?? null
}
