// BTW-tarieven — pure helpers (geen server-imports → bruikbaar in client- én server-components).
//
// De tabel `btw_tarieven` (afgeleid uit Bouw7) is de enige bron van waarheid. Een tarief is
// méér dan een percentage: "Hoog 21%" en "Verlegd Hoog 21%" heten anders en worden anders
// vermeld. Daarom draagt elke regel een `btw_tarief_id` naast `btw_pct`.
//
// LET OP — bewuste bedrijfskeuze (aug 2026, vastgelegd door Tom): een verlegd tarief heft
// hier gewoon zijn nominale percentage, en dat bedrag telt mee in het totaal inclusief BTW.
// Dat wijkt af van de verleggingsregeling, waarbij de leverancier 0% in rekening brengt en
// de afnemer de BTW afdraagt. Verander dit niet "terug" zonder overleg: het bepaalt wat er
// bij de klant in rekening wordt gebracht.

import type { BtwTarief } from '@everts/database/platform-types'

/** Wat de UI nodig heeft om een tarief te tonen en op te slaan. */
export type BtwTariefKeuze = {
  id: string
  label: string
  /** Nominaal tarief zoals de klant het kent (21 bij "Verlegd Hoog 21%"). */
  percentage: number
  verlegd: boolean
  bouw7_id: number | null
}

/**
 * Het tarief zoals het heet: 21 bij "Verlegd Hoog 21%", 9 bij "Verlegd 9%".
 *
 * Bouw7 is hierin niet consequent: "Verlegd Hoog 21%" staat er met percentage 21, maar
 * "Verlegd 21%" en "Verlegd 9%" met percentage 0. Voor die laatste lezen we het percentage
 * uit het label — anders zouden twee tarieven die hetzelfde heten zich verschillend
 * gedragen. De tabel zelf blijft een getrouwe kopie van Bouw7; alleen hier corrigeren we.
 */
export function nominaalPercentage(t: Pick<BtwTariefKeuze, 'percentage' | 'verlegd' | 'label'>): number {
  const pct = Number(t.percentage)
  if (!t.verlegd || pct > 0) return pct
  const uitLabel = /(\d+(?:[.,]\d+)?)\s*%/.exec(t.label)
  return uitLabel ? parseFloat(uitLabel[1].replace(',', '.')) : pct
}

/**
 * Het percentage dat in rekening wordt gebracht — gelijk aan het nominale tarief, óók bij
 * verlegging (zie de bedrijfskeuze bovenaan dit bestand). Dit is de waarde die als
 * `btw_pct` op een regel wordt vastgelegd en waarmee alle bedragen worden gerekend.
 */
export function heffingsPercentage(t: Pick<BtwTariefKeuze, 'percentage' | 'verlegd' | 'label'>): number {
  return nominaalPercentage(t)
}

/** Korte weergave voor tabellen en dropdowns. */
export function tariefKort(t: BtwTariefKeuze): string {
  return t.verlegd ? `${nominaalPercentage(t)}% verlegd` : `${t.percentage}%`
}

export function naarKeuze(
  rij: Pick<BtwTarief, 'id' | 'bouw7_id' | 'label' | 'percentage' | 'verlegd'>,
): BtwTariefKeuze {
  return {
    id: rij.id,
    label: rij.label,
    percentage: Number(rij.percentage),
    verlegd: rij.verlegd,
    bouw7_id: rij.bouw7_id,
  }
}

/**
 * Sorteervolgorde voor keuzelijsten: hoogste percentage eerst, normaal vóór verlegd.
 * Zo staat het meest gebruikte tarief (Hoog 21%) altijd bovenaan.
 */
export function sorteerTarieven(lijst: BtwTariefKeuze[]): BtwTariefKeuze[] {
  return lijst.slice().sort((a, b) =>
    nominaalPercentage(b) - nominaalPercentage(a)
    || Number(a.verlegd) - Number(b.verlegd)
    || a.label.localeCompare(b.label, 'nl'),
  )
}

/**
 * Zoek het tarief dat bij een regel hoort. Nieuwe regels hebben een `btw_tarief_id`; regels
 * van vóór deze koppeling hebben alleen een percentage — die vallen terug op het
 * niet-verlegde tarief met dat percentage (verlegd was toen niet kiesbaar).
 */
export function vindTarief(
  lijst: BtwTariefKeuze[],
  tariefId: string | null | undefined,
  pct: number | null | undefined,
): BtwTariefKeuze | undefined {
  if (tariefId) {
    const opId = lijst.find(t => t.id === tariefId)
    if (opId) return opId
  }
  if (pct == null) return undefined
  return lijst.find(t => !t.verlegd && t.percentage === Number(pct))
}
