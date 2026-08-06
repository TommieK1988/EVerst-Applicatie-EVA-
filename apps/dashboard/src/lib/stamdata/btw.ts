// BTW-tarieven — pure helpers (geen server-imports → bruikbaar in client- én server-components).
//
// De tabel `btw_tarieven` (afgeleid uit Bouw7) is de enige bron van waarheid. Een tarief is
// méér dan een percentage: "Hoog 21%" en "Verlegd Hoog 21%" delen hetzelfde percentage maar
// hebben een ander gevolg. Daarom draagt elke regel een `btw_tarief_id`, en is `btw_pct` het
// *te heffen* percentage — bij een verlegd tarief dus 0.

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
 * Het percentage dat daadwerkelijk geheven wordt. Bij verlegging draagt de afnemer de BTW
 * af, dus rekent de offerte 0% — het nominale percentage blijft alleen ter vermelding.
 */
export function heffingsPercentage(t: Pick<BtwTariefKeuze, 'percentage' | 'verlegd'>): number {
  return t.verlegd ? 0 : Number(t.percentage)
}

/**
 * Het tarief zoals de klant het kent, ook bij verlegging.
 *
 * Bouw7 is hierin niet consequent: "Verlegd Hoog 21%" staat er met percentage 21, maar
 * "Verlegd 21%" en "Verlegd 9%" met percentage 0 (het geheven bedrag). Voor die laatste
 * lezen we het percentage uit het label, anders zou de offerte "BTW verlegd (0%)" melden.
 * We corrigeren alleen de weergave — de tabel blijft een getrouwe kopie van Bouw7.
 */
export function nominaalPercentage(t: Pick<BtwTariefKeuze, 'percentage' | 'verlegd' | 'label'>): number {
  const pct = Number(t.percentage)
  if (!t.verlegd || pct > 0) return pct
  const uitLabel = /(\d+(?:[.,]\d+)?)\s*%/.exec(t.label)
  return uitLabel ? parseFloat(uitLabel[1].replace(',', '.')) : pct
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
