'use client'

import { useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, addDays, isToday, isWeekend, parseISO,
  differenceInDays, differenceInCalendarDays, startOfDay, endOfDay, getISODay, getISOWeek,
  startOfISOWeek, endOfISOWeek, startOfYear, endOfYear,
  addWeeks, subWeeks, addYears, subYears,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import { PPD_PER_VIEW, VANDAAG_ANCHOR, WEEKEND_FACTOR } from './constants'

const DAG_MS = 86_400_000

/** Breedte van één dag: werkdag = ppd, weekend (za/zo) = ppd × factor. */
function dagBreedte(d: Date, ppd: number, factor: number): number {
  return isWeekend(d) ? ppd * factor : ppd
}

/** Cumulatieve left-posities + breedtes per dag in [vs..ve], met (optioneel) smalle weekenddagen. */
function cumulatief(vs: Date, ve: Date, ppd: number, factor: number) {
  const days = eachDayOfInterval({ start: vs, end: ve })
  const lefts: number[] = []
  const widths: number[] = []
  let acc = 0
  for (const d of days) {
    lefts.push(acc)
    const w = dagBreedte(d, ppd, factor)
    widths.push(w)
    acc += w
  }
  return { days, lefts, widths, totalW: acc }
}

export type View = 'dag' | 'week' | '2weken' | 'maand' | 'kwartaal' | 'jaar'

export type HSpan = { key: string; label: string; left: number; width: number }
export type HCol  = {
  key: string; label: string; subLabel?: string
  left: number; width: number
  isToday?: boolean; isWeekend?: boolean; isBorder?: boolean
}
export type GridUnit = {
  key: string; left: number; width: number
  isWeekend?: boolean; isToday?: boolean
  borderStrength: 'none' | 'minor' | 'major'
}

export function viewBereik(view: View, pd: Date): { vs: Date; ve: Date } {
  switch (view) {
    case 'dag':      return { vs: startOfDay(pd), ve: endOfDay(pd) }
    case 'week':     return { vs: startOfISOWeek(pd), ve: endOfISOWeek(pd) }
    case '2weken': {
      const vs = startOfISOWeek(pd)
      return { vs, ve: endOfISOWeek(addWeeks(vs, 1)) }
    }
    case 'maand':    return { vs: startOfMonth(pd), ve: endOfMonth(pd) }
    case 'kwartaal': {
      const qs = new Date(pd.getFullYear(), Math.floor(pd.getMonth() / 3) * 3, 1)
      return { vs: qs, ve: endOfMonth(addMonths(qs, 2)) }
    }
    case 'jaar': return { vs: startOfYear(pd), ve: endOfYear(pd) }
  }
}

export function navigatePeriode(view: View, pd: Date, dir: -1 | 1): Date {
  switch (view) {
    case 'dag':      return addDays(pd, dir)
    case 'week':     return dir === 1 ? addWeeks(pd, 1) : subWeeks(pd, 1)
    case '2weken':   return dir === 1 ? addWeeks(pd, 2) : subWeeks(pd, 2)
    case 'maand':    return addMonths(pd, dir)
    case 'kwartaal': return addMonths(pd, dir * 3)
    case 'jaar':     return dir === 1 ? addYears(pd, 1) : subYears(pd, 1)
  }
}

export function periodeLabel(view: View, pd: Date): string {
  const { vs, ve } = viewBereik(view, pd)
  switch (view) {
    case 'dag':
      return format(pd, 'EEEE d MMMM yyyy', { locale: nl })
    case 'week':
      return `Week ${getISOWeek(vs)} · ${format(vs, 'd MMM', { locale: nl })} – ${format(ve, 'd MMM yyyy', { locale: nl })}`
    case '2weken':
      return `${format(vs, 'd MMM', { locale: nl })} – ${format(ve, 'd MMM yyyy', { locale: nl })}`
    case 'maand':
      return format(pd, 'MMMM yyyy', { locale: nl })
    case 'kwartaal': {
      const qs = new Date(pd.getFullYear(), Math.floor(pd.getMonth() / 3) * 3, 1)
      return `Q${Math.floor(pd.getMonth() / 3) + 1} · ${format(qs, 'MMM', { locale: nl })}–${format(addMonths(qs, 2), 'MMM yyyy', { locale: nl })}`
    }
    case 'jaar': return String(pd.getFullYear())
  }
}

export function buildHeader(view: View, vs: Date, ve: Date, ppd: number, weekendFactor = WEEKEND_FACTOR): { spans: HSpan[]; cols: HCol[] } {
  const { days, lefts, widths } = cumulatief(vs, ve, ppd, weekendFactor)

  if (view === 'dag') {
    // Uur-detail: één span per dag, kolommen per uur.
    const spans: HSpan[] = days.map((d, i) => ({
      key: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEEE d MMMM', { locale: nl }),
      left: lefts[i], width: widths[i],
    }))
    const cols: HCol[] = []
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const base = lefts[i], hourW = widths[i] / 24
      const today = isToday(d), weekend = isWeekend(d)
      for (let h = 0; h < 24; h++) {
        cols.push({
          key: `${d.toISOString()}-h${h}`,
          label: String(h).padStart(2, '0'),
          left: base + h * hourW, width: hourW,
          isToday: today, isWeekend: weekend, isBorder: h === 0,
        })
      }
    }
    return { spans, cols }
  }

  if (view === 'week' || view === '2weken') {
    const spans: HSpan[] = []
    if (view === 'week') {
      spans.push({ key: 'wk', label: `Week ${getISOWeek(vs)} · ${format(vs, 'd MMMM yyyy', { locale: nl })}`, left: lefts[0], width: widths.reduce((a, b) => a + b, 0) })
    } else {
      // 2 weken: één span per ISO-week
      const wkMap: Record<string, HSpan> = {}
      for (let i = 0; i < days.length; i++) {
        const d = days[i]
        const k = `${d.getFullYear()}-W${getISOWeek(d)}`
        if (!wkMap[k]) wkMap[k] = { key: k, label: `Week ${getISOWeek(d)}`, left: lefts[i], width: 0 }
        wkMap[k].width += widths[i]
      }
      spans.push(...Object.values(wkMap))
    }
    return {
      spans,
      cols: days.map((d, i) => ({
        key: d.toISOString(), label: format(d, 'd'),
        subLabel: format(d, 'EEEEE', { locale: nl }),
        left: lefts[i], width: widths[i],
        isToday: isToday(d), isWeekend: isWeekend(d),
      })),
    }
  }

  if (view === 'maand') {
    const spanMap: Record<string, HSpan> = {}
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const k = format(d, 'yyyy-MM')
      if (!spanMap[k]) spanMap[k] = { key: k, label: format(d, 'MMMM yyyy', { locale: nl }), left: lefts[i], width: 0 }
      spanMap[k].width += widths[i]
    }
    return {
      spans: Object.values(spanMap),
      cols: days.map((d, i) => ({
        key: d.toISOString(), label: format(d, 'd'),
        subLabel: getISODay(d) === 1 ? `W${getISOWeek(d)}` : undefined,
        left: lefts[i], width: widths[i],
        isToday: isToday(d), isWeekend: isWeekend(d), isBorder: getISODay(d) === 1,
      })),
    }
  }

  if (view === 'kwartaal') {
    const spanMap: Record<string, HSpan> = {}
    const weekMap: Record<string, HCol> = {}
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const mk = format(d, 'yyyy-MM')
      if (!spanMap[mk]) spanMap[mk] = { key: mk, label: format(d, 'MMMM', { locale: nl }), left: lefts[i], width: 0 }
      spanMap[mk].width += widths[i]
      const wk = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`
      if (!weekMap[wk]) weekMap[wk] = { key: wk, label: `W${getISOWeek(d)}`, left: lefts[i], width: 0, isBorder: true }
      weekMap[wk].width += widths[i]
    }
    return { spans: Object.values(spanMap), cols: Object.values(weekMap) }
  }

  // jaar
  const spanMap: Record<string, HSpan> = {}
  const monthMap: Record<string, HCol> = {}
  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const yk = String(d.getFullYear())
    if (!spanMap[yk]) spanMap[yk] = { key: yk, label: yk, left: lefts[i], width: 0 }
    spanMap[yk].width += widths[i]
    const mk = format(d, 'yyyy-MM')
    if (!monthMap[mk]) monthMap[mk] = { key: mk, label: format(d, 'MMM', { locale: nl }), left: lefts[i], width: 0, isBorder: true }
    monthMap[mk].width += widths[i]
  }
  return { spans: Object.values(spanMap), cols: Object.values(monthMap) }
}

export function buildGridUnits(view: View, vs: Date, ve: Date, ppd: number, weekendFactor = WEEKEND_FACTOR): GridUnit[] {
  const { days, lefts, widths } = cumulatief(vs, ve, ppd, weekendFactor)

  if (view === 'dag' || view === 'week') {
    // Major: per dag · Minor: per uur
    const units: GridUnit[] = []
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const left = lefts[i], hourW = widths[i] / 24
      for (let h = 0; h < 24; h++) {
        units.push({
          key: `${d.toISOString()}-h${h}`,
          left: left + h * hourW,
          width: hourW,
          isWeekend: isWeekend(d), isToday: isToday(d),
          borderStrength: h === 0 ? 'major' : 'minor',
        })
      }
    }
    return units
  }
  if (view === '2weken' || view === 'maand') {
    return days.map((d, i) => ({
      key: d.toISOString(),
      left: lefts[i], width: widths[i],
      isWeekend: isWeekend(d), isToday: isToday(d),
      borderStrength: getISODay(d) === 1 ? 'major' : 'minor',
    }))
  }
  if (view === 'kwartaal') {
    return days.map((d, i) => ({
      key: d.toISOString(),
      left: lefts[i], width: widths[i],
      isWeekend: isWeekend(d), isToday: isToday(d),
      borderStrength: d.getDate() === 1 ? 'major' : 'minor',
    }))
  }
  // jaar: Major: per maand · Minor: per week (maandag)
  const units: GridUnit[] = []
  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const isMonthStart = d.getDate() === 1
    const isWeekStart  = getISODay(d) === 1
    if (!isMonthStart && !isWeekStart) continue
    units.push({
      key: d.toISOString(),
      left: lefts[i], width: widths[i],
      isToday: isToday(d),
      borderStrength: isMonthStart ? 'major' : 'minor',
    })
  }
  return units
}

export function dagOffset(datum: string, vs: Date): number {
  return differenceInDays(startOfDay(parseISO(datum)), startOfDay(vs))
}

export function verschuifTs(iso: string, days: number): string {
  return addDays(parseISO(iso), days).toISOString()
}

export function verschuifDatum(yyyymmdd: string, days: number): string {
  return format(addDays(parseISO(yyyymmdd), days), 'yyyy-MM-dd')
}

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
