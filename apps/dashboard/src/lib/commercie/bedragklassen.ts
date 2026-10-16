/**
 * Bedragklassen van de offertebewaking.
 *
 * Niet elke offerte verdient een telefoontje. Afgesproken (okt 2026):
 *  - klein  (< € 3.000): niet nabellen; reageert de klant niet, dan laat je hem lopen;
 *  - middel (€ 3.000 – 45.000): nabellen als het werk het toelaat, bijvoorbeeld als je uit je werk loopt;
 *  - groot  (€ 45.000 – 125.000): altijd nabellen;
 *  - mega   (vanaf € 125.000): altijd nabellen, met extra regels voor eigenaar en hercontrole.
 *
 * De grenzen staan hier op één plek. Worden ze later een instelling, dan verandert alleen dit
 * bestand. Puur en zonder `'use server'`, zodat lijst, kaart en server hetzelfde rekenen.
 */

export type Bedragklasse = 'mega' | 'groot' | 'middel' | 'klein'

export const KLEIN_TOT = 3_000
export const GROOT_VANAF = 45_000
export const MEGA_VANAF = 125_000

export const BEDRAGKLASSEN: { klasse: Bedragklasse; label: string; uitleg: string }[] = [
  { klasse: 'mega',   label: 'Mega',   uitleg: 'vanaf € 125k' },
  { klasse: 'groot',  label: 'Groot',  uitleg: '€ 45k – 125k' },
  { klasse: 'middel', label: 'Middel', uitleg: '€ 3k – 45k' },
  { klasse: 'klein',  label: 'Klein',  uitleg: 'tot € 3k, niet nabellen' },
]

/** Zonder bedrag telt een offerte als middel: niet weggestopt, maar ook niet voorrang. */
export function bedragklasse(bedrag: number | null): Bedragklasse {
  if (bedrag == null) return 'middel'
  if (bedrag >= MEGA_VANAF) return 'mega'
  if (bedrag >= GROOT_VANAF) return 'groot'
  if (bedrag < KLEIN_TOT) return 'klein'
  return 'middel'
}

/** Standaard in Te doen: alles behalve klein. Klein wordt niet nagebeld. */
export const STANDAARD_KLASSEN: Record<Bedragklasse, boolean> = {
  mega: true, groot: true, middel: true, klein: false,
}
