'use client'

import { useMemo } from 'react'
import { addDays, differenceInCalendarDays, differenceInDays, parseISO, startOfDay } from 'date-fns'
import { PPD_PER_VIEW, VANDAAG_ANCHOR, WEEKEND_FACTOR } from './constants'
import { buildGridUnits, buildHeader, cumulatief, DAG_MS, dagOffset, viewBereik } from './tijdas'
import type { GridUnit, HCol, HSpan, View } from './tijdas'

/**
 * De rekenkant van de tijdlijn staat in `./tijdas` — zonder React, zodat de
 * detailplanning-PDF er serverside dezelfde kolomindeling uit haalt als het
 * scherm. Hier blijft alleen de hook staan die er viewport-state omheen legt.
 *
 * Alles wordt doorgegeven: wie vandaag `./usePlanningLayout` importeert, houdt
 * precies wat hij had.
 */
export * from './tijdas'

// ─── Hook ────────────────────────────────────────────────────────────────────

export type PlanningLayout = {
  view:        View
  peildatum:   Date
  /** Begin van de gerenderde (gepadde) range — niet de periodegrens. */
  vs:          Date
  /** Einde van de gerenderde (gepadde) range. */
  ve:          Date
  /** Periodegrens (zonder buffer) van de peildatum — voor scroll-ankering. */
  periodeVs:   Date
  periodeVe:   Date
  ppd:         number
  totalDays:   number
  totalW:      number
  spans:       HSpan[]
  cols:        HCol[]
  gridUnits:   GridUnit[]
  /** Aantal dagen vanaf vs (negatief mogelijk). */
  dagOffset:   (iso: string) => number
  /** Pixel-positie (left) van een ISO-datum/-tijd, weekend- en tijd-bewust, geclamped op [0..totalW]. */
  xVoor:       (iso: string) => number
  /** Pixelbreedte tussen twee ISO-datum/-tijden (weekend-bewust). */
  breedteVoor: (startIso: string, eindIso: string) => number
  /** Inverse van xVoor: de dag (00:00) die op pixel-positie `px` staat — voor drag-naar-datum. */
  dagVoorX:    (px: number) => Date
}

/**
 * Tijdlijn-layout met een **vaste dagbreedte** (PPD_PER_VIEW) i.p.v. fit-to-screen.
 * De gerenderde range is de periode (viewBereik) uitgebreid met een dynamische buffer
 * links/rechts, berekend uit `availableW`, zodat de strook altijd breder is dan het
 * scherm (horizontaal scrollbaar) én "Vandaag"/de periodegrens op VANDAAG_ANCHOR
 * (1/6) kan worden gezet zonder negatieve scrollpositie.
 */
export function usePlanningLayout({
  peildatum, view, availableW, weekendFactor = WEEKEND_FACTOR,
}: { peildatum: Date; view: View; availableW: number; weekendFactor?: number }): PlanningLayout {
  const ppd = PPD_PER_VIEW[view] ?? 18

  const { periodeVs, periodeVe } = useMemo(() => {
    const { vs, ve } = viewBereik(view, peildatum)
    return { periodeVs: vs, periodeVe: ve }
  }, [view, peildatum])

  const { vs, ve } = useMemo(() => {
    // Genoeg ruimte links voor de 1/6-ankering, en rechts om de viewport te vullen.
    const leftBuf  = Math.ceil((availableW * VANDAAG_ANCHOR) / ppd) + 2
    const rightBuf = Math.ceil((availableW * (1 - VANDAAG_ANCHOR)) / ppd) + 2
    return { vs: addDays(periodeVs, -leftBuf), ve: addDays(periodeVe, rightBuf) }
  }, [periodeVs, periodeVe, availableW, ppd])

  const totalDays  = useMemo(() => differenceInDays(startOfDay(ve), startOfDay(vs)) + 1, [vs, ve])
  const geo        = useMemo(() => cumulatief(vs, ve, ppd, weekendFactor), [vs, ve, ppd, weekendFactor])
  const totalW     = geo.totalW
  const { spans, cols } = useMemo(() => buildHeader(view, vs, ve, ppd, weekendFactor), [view, vs, ve, ppd, weekendFactor])
  const gridUnits  = useMemo(() => buildGridUnits(view, vs, ve, ppd, weekendFactor), [view, vs, ve, ppd, weekendFactor])

  const vs0 = startOfDay(vs).getTime()
  const dagOff = (iso: string) => dagOffset(iso, vs)

  // Weekend- én tijd-bewuste pixel-positie van een datum/tijd.
  const xVoor = (iso: string) => {
    const t = parseISO(iso).getTime()
    const dayIdx = differenceInCalendarDays(new Date(t), vs)
    if (dayIdx < 0) return 0
    if (dayIdx >= geo.widths.length) return totalW
    const dayStart = vs0 + dayIdx * DAG_MS
    const frac = Math.max(0, Math.min(1, (t - dayStart) / DAG_MS))
    return geo.lefts[dayIdx] + frac * geo.widths[dayIdx]
  }
  const breedteVoor = (startIso: string, eindIso: string) => Math.max(0, xVoor(eindIso) - xVoor(startIso))

  const dagVoorX = (px: number) => {
    if (px <= 0) return startOfDay(vs)
    for (let i = 0; i < geo.lefts.length; i++) {
      if (px < geo.lefts[i] + geo.widths[i]) return addDays(startOfDay(vs), i)
    }
    return addDays(startOfDay(vs), geo.lefts.length - 1)
  }

  return {
    view, peildatum, vs, ve, periodeVs, periodeVe,
    ppd, totalDays, totalW, spans, cols, gridUnits,
    dagOffset: dagOff, xVoor, breedteVoor, dagVoorX,
  }
}
