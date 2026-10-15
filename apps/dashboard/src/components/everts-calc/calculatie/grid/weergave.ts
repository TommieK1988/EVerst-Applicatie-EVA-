/** Wat het rekenblad laat zien, voor de hele calculatie in één keer (menu Tonen). */
export type Weergave = 'groepen' | 'regels' | 'normen' | 'alles'

export const WEERGAVE_LABEL: Record<Weergave, string> = {
  groepen: 'Alleen groepen',
  regels:  'Regels',
  normen:  'Regels + normen',
  alles:   'Regels + normen + omschrijvingen',
}

/**
 * Signaal aan alle regels: zet normen en werkomschrijving open of dicht. `n` telt op,
 * zodat dezelfde keuze nog een keer kiezen ook werkt (na losse wijzigingen per regel).
 */
export interface WeergaveSignaal { n: number; normen: boolean; werk: boolean }
