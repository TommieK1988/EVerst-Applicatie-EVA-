/**
 * import-structuur.ts
 *
 * Gedeelde helpers om vanuit de EvertsCalc-groepenboom de offerte-structuur te
 * bepalen die bij het importeren als quote_sections wordt weggeschreven.
 *
 * Twee dingen die eerder per import-pad gedupliceerd waren:
 *  - buildNummers: dotted outline-nummering (1, 1.1, 1.1.1) uit niveau + parent.
 *  - buildStructuur: welke groepen als sectie meegaan (inclusief lege
 *    hoofdstuk-groepen die alleen kinderen hebben) én in welke volgorde.
 */

import type { Groep } from './types'

export interface StructuurGroep {
  groep_id: string
  naam: string
  nummer: string | null
  niveau: number
  optioneel: boolean
}

/** Bouwt dotted nummering (1, 1.1, 1.1.1) vanuit niveau + parent + volgorde. */
export function buildNummers(groepen: Groep[]): Map<string, string> {
  const result = new Map<string, string>()
  const n1 = groepen.filter(g => g.niveau === 1).sort((a, b) => a.volgorde - b.volgorde)
  const n2 = groepen.filter(g => g.niveau === 2).sort((a, b) => a.volgorde - b.volgorde)
  const n3 = groepen.filter(g => g.niveau === 3).sort((a, b) => a.volgorde - b.volgorde)
  n1.forEach((g, i) => {
    const num = String(i + 1)
    result.set(g.id, num)
    n2.filter(k => k.parent_id === g.id).forEach((k, j) => {
      const num2 = `${num}.${j + 1}`
      result.set(k.id, num2)
      n3.filter(k3 => k3.parent_id === k.id).forEach((k3, l) => {
        result.set(k3.id, `${num2}.${l + 1}`)
      })
    })
  })
  return result
}

/**
 * Vergelijkt twee dotted nummers (1, 1.1, 1.10, 2.1) hiërarchisch: eerst op het
 * eerste segment, dan het tweede, enz. Zo komen secties in outline-volgorde
 * (1, 1.1, 1.2, 2, 2.1, 3.1) i.p.v. op de per-ouder tellende groep-volgorde.
 */
export function vergelijkNummer(a: string, b: string): number {
  const da = (a || '').split('.').map(Number)
  const db = (b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(da.length, db.length); i++) {
    const va = da[i] ?? -1
    const vb = db[i] ?? -1
    if (va !== vb) return va - vb
  }
  return 0
}

/**
 * Bepaalt welke groepen als sectie geïmporteerd worden, in outline-volgorde:
 * elke groep met regels plus al zijn voorouders (de hoofdstukken erboven). Lege
 * hoofdstuk-groepen — die zelf geen regels hebben maar wel subgroepen — blijven
 * zo behouden, zodat de offerte de volledige structuurboom kan tonen.
 */
export function buildStructuur(
  groepen: Groep[],
  heeftRegels: (groepId: string) => boolean,
  nummers: Map<string, string>,
): StructuurGroep[] {
  const perId = new Map(groepen.map(g => [g.id, g]))
  const houden = new Set<string>()

  for (const g of groepen) {
    if (!heeftRegels(g.id)) continue
    // Voeg de groep zelf + alle voorouders (hoofdstukken) toe.
    let cur: Groep | undefined = g
    while (cur) {
      houden.add(cur.id)
      cur = cur.parent_id ? perId.get(cur.parent_id) : undefined
    }
  }

  return groepen
    .filter(g => houden.has(g.id))
    .map(g => ({
      groep_id: g.id,
      naam: g.naam,
      nummer: nummers.get(g.id) ?? null,
      niveau: g.niveau,
      optioneel: g.optioneel ?? false,
    }))
    .sort((a, b) => vergelijkNummer(a.nummer ?? '', b.nummer ?? ''))
}
