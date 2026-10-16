/**
 * calculatietarief.ts — Het uurtarief van een calculatie en de regels die ervan afwijken.
 *
 * Een calculatie begint met het ★-tarief uit Stamgegevens → Uren → Uurtarieven. Per
 * arbeidsnorm mag de calculator afwijken, bijvoorbeeld als de uitvoerder een ander
 * tarief krijgt. Verandert het calculatietarief, dan gaan alleen de normen mee die het
 * oude tarief volgden; de afwijkingen blijven staan en Controle laat ze nakijken.
 */

import type { Componentregel } from './types'

/** Volgt deze arbeidsnorm het calculatietarief (of heeft hij nog geen tarief)? */
export function volgtCalculatietarief(tarief: number | undefined | null, calculatietarief: number): boolean {
  return !tarief || Math.abs(tarief - calculatietarief) < 0.005
}

/** Heeft deze arbeidsnorm bewust een eigen tarief, anders dan dat van de calculatie? */
export function heeftEigenTarief(c: Pick<Componentregel, 'type' | 'tarief' | 'norm_hoeveelheid'>, calculatietarief: number): boolean {
  return c.type === 'arbeid' && calculatietarief > 0 && c.norm_hoeveelheid !== 0
    && !volgtCalculatietarief(c.tarief, calculatietarief)
}
