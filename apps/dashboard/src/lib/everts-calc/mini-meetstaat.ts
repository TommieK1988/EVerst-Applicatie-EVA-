// ─── MINI-MEETSTAAT: REKENEN EN BEWAREN ─────────────────────────────────────
// De dubbelklik op een hoeveelheid in de calculatie opent de mini-meetstaat. Vroeger
// landde alleen het totaal in de regel en waren de maten daarna weg. Nu bewaart de
// regel de meting (`Calculatieregel.mini_meetstaat`), zodat je hem terugziet.
//
// De hoeveelheid in de calculatie blijft leidend. Typ je die daarna met de hand over,
// dan klopt de meting niet meer; de dialog laat dat zien in plaats van stil één van
// beide te overschrijven.

import { nieuweId } from './utils'
import { normaliseerEenheid, rekenMaat } from './maat-rekenen'
import type { MiniMaatrij, MiniMeting } from './types'

/** Eenheden waarbij de rij alleen een aantal heeft (geen maten). */
export const isAlleenAantal = (e: string) => !['m²', 'm¹', 'm³'].includes(e)

/**
 * Rekent met dezelfde regel als de meetstaat (`rekenMaat`). Een rij zonder één
 * ingevuld getal telt niet: de factor staat hier standaard op 1, en zou een lege
 * rij anders als 1 laten meetellen.
 */
export function berekenRij(rij: MiniMaatrij, eenh: string): number {
  if (!(rij.dim1 > 0 || rij.dim2 > 0 || rij.dim3 > 0)) return 0
  if (isAlleenAantal(eenh)) return rekenMaat({ eenheid: eenh, aantal: rij.dim1 })
  // m¹: de lengte is één breedte. m³: lengte × breedte × hoogte.
  return rekenMaat({
    eenheid: eenh,
    breedte: rij.dim1,
    hoogte: eenh === 'm¹' ? undefined : rij.dim2,
    diepte: eenh === 'm³' ? rij.dim3 : undefined,
    factor: rij.factor,
  })
}

export function totaalMeting(rijen: MiniMaatrij[], eenh: string): number {
  return +(rijen.reduce((s, r) => s + berekenRij(r, eenh), 0)).toFixed(4)
}

export function rijHeeftData(r: MiniMaatrij): boolean {
  return r.dim1 > 0 || r.dim2 > 0 || r.dim3 > 0 || !!r.omschrijving.trim()
}

export function legeRij(): MiniMaatrij {
  return { id: nieuweId(), omschrijving: '', dim1: 0, dim2: 0, dim3: 0, factor: 1 }
}

export function prefillRij(hoeveelheid: number, eenh: string): MiniMaatrij {
  const rij = legeRij()
  if (hoeveelheid <= 0) return rij
  // De bestaande hoeveelheid × 1 (× 1). Niet als wortel verdelen over de maten:
  // √10 afgerond is 3,16, en 3,16 × 3,16 = 9,99. Wie alleen een rij toevoegt,
  // zou dan ongemerkt de hoeveelheid die er al stond veranderen.
  const label = { omschrijving: 'Bestaande hoeveelheid', factor: 1 }
  if (eenh === 'm²') return { ...rij, ...label, dim1: hoeveelheid, dim2: 1 }
  if (eenh === 'm³') return { ...rij, ...label, dim1: hoeveelheid, dim2: 1, dim3: 1 }
  return { ...rij, ...label, dim1: hoeveelheid }
}

/** Afwijking die nog als "gelijk" telt: afronding op twee decimalen in de calculatie. */
const MARGE = 0.005

export interface StartToestand {
  rijen: MiniMaatrij[]
  /** De bewaarde meting telt op tot iets anders dan de hoeveelheid in de calculatie. */
  afwijking: { meting: number; calculatie: number } | null
}

/**
 * Waarmee de dialog opent. Is er een bewaarde meting in dezelfde eenheid, dan die
 * (plus een lege rij om door te typen). Anders zoals vroeger: de bestaande
 * hoeveelheid als eerste rij.
 */
export function startToestand(
  bewaard: MiniMeting | undefined,
  hoeveelheid: number,
  eenheid: string,
): StartToestand {
  const eenh = normaliseerEenheid(eenheid)
  const rijen = bewaard && normaliseerEenheid(bewaard.eenheid) === eenh
    ? bewaard.rijen.filter(rijHeeftData)
    : []
  if (rijen.length > 0) {
    const meting = totaalMeting(rijen, eenh)
    const afwijking = Math.abs(meting - hoeveelheid) >= MARGE ? { meting, calculatie: hoeveelheid } : null
    return { rijen: [...rijen, legeRij()], afwijking }
  }
  return {
    rijen: hoeveelheid > 0 ? [prefillRij(hoeveelheid, eenh), legeRij()] : [legeRij()],
    afwijking: null,
  }
}

/** Wat de regel bewaart: alleen rijen met inhoud. */
export function maakMeting(rijen: MiniMaatrij[], eenheid: string, nu = new Date().toISOString()): MiniMeting {
  return { eenheid, rijen: rijen.filter(rijHeeftData), gemeten_op: nu }
}
