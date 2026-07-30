import type { RepairRegistration } from './types'

/**
 * Aggregaten per registratie. De waarheid zijn de werkzaamheden-regels (aantal ×
 * per-stuk); alleen registraties van vóór de regels-tabel vallen terug op de
 * aggregaat-snapshot op de registratie zelf.
 *
 * Gedeeld door de Houtrot-tab en de rapportage: als beide hun eigen som maken,
 * staan er vroeg of laat twee verschillende bedragen op het scherm en op papier.
 */
export type SomVeld =
  | 'labor_hours_snapshot'
  | 'labor_cost_snapshot'
  | 'material_cost_snapshot'
  | 'cost_price_snapshot'
  | 'line_sale_total'

export function somRegels(r: RepairRegistration, veld: SomVeld, fallback: number): number {
  if (!r.lines || r.lines.length === 0) return fallback
  return r.lines.reduce((s, l) => {
    if (veld === 'line_sale_total') return s + Number(l.line_sale_total ?? 0)
    return s + Number(l.aantal) * Number(l[veld] ?? 0)
  }, 0)
}

/** Verkooptotaal van één registratie. */
export const registratieVerkoop = (r: RepairRegistration): number =>
  somRegels(r, 'line_sale_total', Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0))

/** Kostprijstotaal van één registratie. */
export const registratieKostprijs = (r: RepairRegistration): number =>
  somRegels(r, 'cost_price_snapshot', Number(r.actual_cost_price ?? r.cost_price_snapshot ?? 0))

/** Arbeidsuren van één registratie. */
export const registratieUren = (r: RepairRegistration): number =>
  somRegels(r, 'labor_hours_snapshot', Number(r.actual_labor_hours ?? r.labor_hours_snapshot ?? 0))

/** Arbeidskosten van één registratie. */
export const registratieArbeid = (r: RepairRegistration): number =>
  somRegels(r, 'labor_cost_snapshot', Number(r.labor_cost_snapshot ?? 0))

/** Materiaalkosten van één registratie. */
export const registratieMateriaal = (r: RepairRegistration): number =>
  somRegels(r, 'material_cost_snapshot', Number(r.actual_material_cost ?? r.material_cost_snapshot ?? 0))

/** De werkzaamheden-regels op volgorde (kopie, sorteert de bron niet). */
export const gesorteerdeRegels = (r: RepairRegistration) =>
  (r.lines ?? []).slice().sort((a, b) => a.volgorde - b.volgorde)

/** "2× Houtrotherstel dorpel · 1× Kitwerk" — terugval op de reparatienaam-snapshot. */
export function werkzaamhedenTekst(r: RepairRegistration): string {
  const regels = gesorteerdeRegels(r)
  if (regels.length === 0) return r.repair_name_snapshot ?? ''
  return regels.map(l => `${Number(l.aantal)}× ${l.repair_name_snapshot ?? 'Werkzaamheid'}`).join(' · ')
}
