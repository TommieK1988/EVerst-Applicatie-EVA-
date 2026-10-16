/**
 * Plekhouders in "Wat is nieuw"-teksten die een instelbare waarde noemen.
 *
 * Een changelog-item is data: het wordt één keer geschreven en blijft daarna staan. Noemt het een
 * bedrag dat in de instellingen te wijzigen is, dan klopt de tekst niet meer zodra iemand die
 * waarde aanpast. Daarom staat er in de tekst een plekhouder (`{offerte_klein_tot}`) en vult het
 * scherm de actuele waarde in. Onbekende plekhouders blijven staan zoals ze zijn.
 */

import type { Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'

const euro = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(n)}`

export function heeftPlekhouder(tekst: string): boolean {
  return /\{[a-z_]+\}/.test(tekst)
}

export function vulPlekhouders(tekst: string, w: { grenzen: Bedragklassegrenzen }): string {
  const waarden: Record<string, string> = {
    offerte_klein_tot: euro(w.grenzen.kleinTot),
    offerte_groot_vanaf: euro(w.grenzen.grootVanaf),
    offerte_mega_vanaf: euro(w.grenzen.megaVanaf),
  }
  return tekst.replace(/\{([a-z_]+)\}/g, (heel, sleutel: string) => waarden[sleutel] ?? heel)
}
