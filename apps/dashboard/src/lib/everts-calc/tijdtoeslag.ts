/**
 * tijdtoeslag.ts — Tijdtoeslag per groep: de uren volgens de normen kloppen niet
 * altijd met de tijd die het werk echt kost. De calculator zet per (sub)groep een
 * toeslag, bijvoorbeeld +7,1% om een voorgevel van 35 uur op een hele week (37,5 u)
 * te krijgen.
 *
 * De toeslag telt op alle arbeidsnormen van de regels direct in die groep, met
 * hetzelfde percentage. De normen zelf blijven staan: terug naar 0% en je bent terug
 * bij het origineel. Alles wat uren of arbeidskosten uit een calculatie haalt (rekenblad,
 * offerte, werkbegroting → Bouw7 en planning) rekent met de effectieve norm.
 */

import type { Calculatieregel, Componentregel, Groep } from './types'

export const TOESLAG_MIN = -25
export const TOESLAG_MAX = 50

/** Werkdag waarmee het urenoverzicht dagen en weken telt. */
export const UREN_PER_DAG = 7.5

export function begrensToeslag(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(TOESLAG_MAX, Math.max(TOESLAG_MIN, pct))
}

/** Factor waarmee de arbeidsnormen van de regels in deze groep vermenigvuldigen. */
export function tijdfactor(groep: Pick<Groep, 'tijdtoeslag_pct'> | undefined | null): number {
  const pct = groep?.tijdtoeslag_pct
  return pct ? 1 + begrensToeslag(pct) / 100 : 1
}

/** Factor per regel, via de groep waar hij direct in staat. */
export function maakTijdfactor(groepen: Pick<Groep, 'id' | 'tijdtoeslag_pct'>[]): (regel: Pick<Calculatieregel, 'groep_id'>) => number {
  const perGroep = new Map(groepen.map(g => [g.id, tijdfactor(g)]))
  return regel => perGroep.get(regel.groep_id) ?? 1
}

/**
 * De componenten met de effectieve arbeidsnorm: om weg te schrijven waar de toeslag
 * niet meer bekend is (werkbegroting, offerte, export). Andere typen blijven gelijk.
 */
export function metTijdtoeslag<C extends Pick<Componentregel, 'calculatieregel_id' | 'type' | 'norm_hoeveelheid'>>(
  componenten: C[],
  regels: Pick<Calculatieregel, 'id' | 'groep_id'>[],
  groepen: Pick<Groep, 'id' | 'tijdtoeslag_pct'>[],
): C[] {
  const factorVan = maakTijdfactor(groepen)
  const factorPerRegel = new Map(regels.map(r => [r.id, factorVan(r)]))
  return componenten.map(c => {
    const f = factorPerRegel.get(c.calculatieregel_id) ?? 1
    return c.type === 'arbeid' && f !== 1
      ? { ...c, norm_hoeveelheid: (c.norm_hoeveelheid ?? 0) * f }
      : c
  })
}

/**
 * Toeslag die van `normUren` precies `gewensteUren` maakt, begrensd. Bewust niet
 * afgerond: typ je 30 uur, dan moet er 30,00 staan en geen 29,99. Het label rondt af.
 */
export function toeslagVoorUren(normUren: number, gewensteUren: number): number {
  if (normUren <= 0) return 0
  return begrensToeslag(Math.round((gewensteUren / normUren - 1) * 1e8) / 1e6)
}

/** Label voor de groepskop: "+13,6% tijd". */
export function toeslagLabel(pct: number | undefined): string {
  if (!pct) return ''
  const tekst = Math.abs(pct).toLocaleString('nl-NL', { maximumFractionDigits: 1 })
  return `${pct > 0 ? '+' : '−'}${tekst}% tijd`
}
