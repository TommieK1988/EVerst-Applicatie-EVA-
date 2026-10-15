/**
 * uren-per-groep.ts — De cijfers achter het venster "Uren per groep": per (sub)groep de
 * uren volgens de normen, wat de tijdtoeslag ervan maakt en wat dat aan kostprijs scheelt.
 *
 * Pure functies over de calculatie en een kaart met (nog niet opgeslagen) percentages,
 * zodat het venster live kan rekenen terwijl je schuift of typt.
 */

import type { Calculatieregel, Componentregel, Groep } from './types'
import { berekenCalculatieregel } from './calculations'
import { UREN_PER_DAG, TOESLAG_MAX, TOESLAG_MIN } from './tijdtoeslag'

export interface UrenRij {
  groep: Groep
  diepte: number
  subgroepen: string[]
  /** Uren en arbeidskosten van de regels direct in deze groep, zonder toeslag. */
  eigenUren: number
  eigenArbeid: number
}

/** De groepen in boomvolgorde, met hun eigen uren en arbeid zonder toeslag. */
export function bouwUrenRijen(
  groepen: Groep[],
  regels: Calculatieregel[],
  componenten: Componentregel[],
): UrenRij[] {
  const rijen: UrenRij[] = []
  const kinderen = (parent: string | null) =>
    groepen.filter(g => g.parent_id === parent).sort((a, b) => a.volgorde - b.volgorde)

  const loop = (g: Groep, diepte: number) => {
    let eigenUren = 0, eigenArbeid = 0
    for (const r of regels) {
      if (r.groep_id !== g.id) continue
      const b = berekenCalculatieregel(r, componenten)
      eigenUren += b.uren_totaal
      eigenArbeid += b.arbeid_totaal
    }
    const subs = kinderen(g.id)
    rijen.push({ groep: g, diepte, subgroepen: subs.map(s => s.id), eigenUren, eigenArbeid })
    subs.forEach(s => loop(s, diepte + 1))
  }
  kinderen(null).forEach(g => loop(g, 0))
  return rijen
}

export interface UrenTotaal {
  normUren: number
  calcUren: number
  /** Kostprijs die de toeslag toevoegt (negatief bij minder tijd). */
  kostVerschil: number
  /** Groepen in deze tak met een toeslag ≠ 0. */
  metToeslag: number
}

/** Totalen van een groep en alles eronder, met de percentages uit `pct`. */
export function totaalVan(
  groepId: string,
  rijen: UrenRij[],
  pct: Map<string, number>,
): UrenTotaal {
  const perId = new Map(rijen.map(r => [r.groep.id, r]))
  const som: UrenTotaal = { normUren: 0, calcUren: 0, kostVerschil: 0, metToeslag: 0 }
  const loop = (id: string) => {
    const r = perId.get(id)
    if (!r) return
    const p = pct.get(id) ?? 0
    som.normUren += r.eigenUren
    som.calcUren += r.eigenUren * (1 + p / 100)
    som.kostVerschil += r.eigenArbeid * (p / 100)
    if (p && r.eigenUren) som.metToeslag++
    r.subgroepen.forEach(loop)
  }
  loop(groepId)
  return som
}

/**
 * Afronden op hele dagen of weken: tot en met 3 dagen naar boven op een hele dag,
 * daarboven naar de dichtstbijzijnde hele week. Null als het al rond is of buiten
 * de toegestane toeslag valt.
 */
export function afrondSuggestie(normUren: number, huidigeUren: number): number | null {
  if (normUren <= 0) return null
  const dagen = huidigeUren / UREN_PER_DAG
  const doel = dagen <= 3.5
    ? Math.ceil(dagen - 0.001) * UREN_PER_DAG
    : Math.max(1, Math.round(dagen / 5)) * 5 * UREN_PER_DAG
  if (Math.abs(doel - huidigeUren) < 0.005) return null
  const pct = (doel / normUren - 1) * 100
  if (pct < TOESLAG_MIN - 1e-9 || pct > TOESLAG_MAX + 1e-9) return null
  return doel
}

export function dagenTekst(uren: number): string {
  const d = Math.round((uren / UREN_PER_DAG) * 10) / 10
  if (d >= 5 && d % 5 === 0) return `${d} = ${d / 5} ${d === 5 ? 'week' : 'weken'}`
  return d.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}
