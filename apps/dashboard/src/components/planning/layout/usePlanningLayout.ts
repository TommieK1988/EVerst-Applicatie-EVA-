'use client'

import { useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, addDays, isToday, isWeekend, parseISO,
  differenceInDays, startOfDay, getISODay, getISOWeek,
  startOfISOWeek, endOfISOWeek, startOfYear, endOfYear,
  addWeeks, subWeeks, addYears, subYears,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import { MIN_PPD } from './constants'

export type View = 'week' | '2weken' | 'maand' | 'kwartaal' | 'jaar'

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

export function buildHeader(view: View, vs: Date, ve: Date, ppd: number): { spans: HSpan[]; cols: HCol[] } {
  const days = eachDayOfInterval({ start: vs, end: ve })
  const dx = (d: Date) => differenceInDays(startOfDay(d), startOfDay(vs)) * ppd

  if (view === 'week' || view === '2weken') {
    const spans: HSpan[] = []
    if (view === 'week') {
      spans.push({ key: 'wk', label: `Week ${getISOWeek(vs)} · ${format(vs, 'd MMMM yyyy', { locale: nl })}`, left: 0, width: 7 * ppd })
    } else {
      // 2 weken: één span per ISO-week
      const wkMap: Record<string, HSpan> = {}
      for (const d of days) {
        const k = `${d.getFullYear()}-W${getISOWeek(d)}`
        if (!wkMap[k]) wkMap[k] = { key: k, label: `Week ${getISOWeek(d)}`, left: dx(d), width: 0 }
        wkMap[k].width += ppd
      }
      spans.push(...Object.values(wkMap))
    }
    return {
      spans,
      cols: days.map(d => ({
        key: d.toISOString(), label: format(d, 'd'),
        subLabel: format(d, 'EEEEE', { locale: nl }),
        left: dx(d), width: ppd,
        isToday: isToday(d), isWeekend: isWeekend(d),
      })),
    }
  }

  if (view === 'maand') {
    const spanMap: Record<string, HSpan> = {}
    for (const d of days) {
      const k = format(d, 'yyyy-MM')
      if (!spanMap[k]) spanMap[k] = { key: k, label: format(d, 'MMMM yyyy', { locale: nl }), left: dx(d), width: 0 }
      spanMap[k].width += ppd
    }
    return {
      spans: Object.values(spanMap),
      cols: days.map(d => ({
        key: d.toISOString(), label: format(d, 'd'),
        subLabel: getISODay(d) === 1 ? `W${getISOWeek(d)}` : undefined,
        left: dx(d), width: ppd,
        isToday: isToday(d), isWeekend: isWeekend(d), isBorder: getISODay(d) === 1,
      })),
    }
  }

  if (view === 'kwartaal') {
    const spanMap: Record<string, HSpan> = {}
    for (const d of days) {
      const k = format(d, 'yyyy-MM')
      if (!spanMap[k]) spanMap[k] = { key: k, label: format(d, 'MMMM', { locale: nl }), left: dx(d), width: 0 }
      spanMap[k].width += ppd
    }
    const weekSeen = new Set<string>()
    const cols: HCol[] = []
    for (const d of days) {
      if (getISODay(d) !== 1 && cols.length > 0) continue
      const wk = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`
      if (weekSeen.has(wk)) continue
      weekSeen.add(wk)
      const w = Math.min(7, differenceInDays(ve, d) + 1) * ppd
      cols.push({ key: wk, label: `W${getISOWeek(d)}`, left: cols.length === 0 ? 0 : dx(d), width: w, isBorder: true })
    }
    return { spans: Object.values(spanMap), cols }
  }

  // jaar
  const spanMap: Record<string, HSpan> = {}
  for (const d of days) {
    const k = String(d.getFullYear())
    if (!spanMap[k]) spanMap[k] = { key: k, label: k, left: 0, width: 0 }
    spanMap[k].width += ppd
  }
  const monthMap: Record<string, HCol> = {}
  for (const d of days) {
    const k = format(d, 'yyyy-MM')
    if (!monthMap[k]) monthMap[k] = { key: k, label: format(d, 'MMM', { locale: nl }), left: dx(d), width: 0, isBorder: true }
    monthMap[k].width += ppd
  }
  return { spans: Object.values(spanMap), cols: Object.values(monthMap) }
}

export function buildGridUnits(view: View, vs: Date, ve: Date, ppd: number): GridUnit[] {
  const days = eachDayOfInterval({ start: vs, end: ve })
  const dx = (d: Date) => differenceInDays(startOfDay(d), startOfDay(vs)) * ppd

  if (view === 'week') {
    // Major: per dag · Minor: per uur
    const units: GridUnit[] = []
    const hourW = ppd / 24
    for (const d of days) {
      const left = dx(d)
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
    return days.map(d => ({
      key: d.toISOString(),
      left: dx(d), width: ppd,
      isWeekend: isWeekend(d), isToday: isToday(d),
      borderStrength: getISODay(d) === 1 ? 'major' : 'minor',
    }))
  }
  if (view === 'kwartaal') {
    return days.map(d => ({
      key: d.toISOString(),
      left: dx(d), width: ppd,
      isWeekend: isWeekend(d), isToday: isToday(d),
      borderStrength: d.getDate() === 1 ? 'major' : 'minor',
    }))
  }
  // jaar: Major: per maand · Minor: per week (maandag)
  const units: GridUnit[] = []
  for (const d of days) {
    const isMonthStart = d.getDate() === 1
    const isWeekStart  = getISODay(d) === 1
    if (!isMonthStart && !isWeekStart) continue
    units.push({
      key: d.toISOString(),
      left: dx(d), width: ppd,
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
  vs:          Date
  ve:          Date
  ppd:         number
  totalDays:   number
  totalW:      number
  spans:       HSpan[]
  cols:        HCol[]
  gridUnits:   GridUnit[]
  /** Aantal dagen vanaf vs (negatief mogelijk). */
  dagOffset:   (iso: string) => number
  /** Pixel-positie (left) van een ISO-datum, geclamped op [0..totalW). */
  xVoor:       (iso: string) => number
}

export function usePlanningLayout({
  peildatum, view, availableW,
}: { peildatum: Date; view: View; availableW: number }): PlanningLayout {
  const { vs, ve } = useMemo(() => viewBereik(view, peildatum), [view, peildatum])
  const totalDays  = useMemo(() => differenceInDays(startOfDay(ve), startOfDay(vs)) + 1, [vs, ve])
  const ppd        = useMemo(() => Math.max(MIN_PPD, availableW / totalDays), [availableW, totalDays])
  const totalW     = totalDays * ppd
  const { spans, cols } = useMemo(() => buildHeader(view, vs, ve, ppd), [view, vs, ve, ppd])
  const gridUnits  = useMemo(() => buildGridUnits(view, vs, ve, ppd), [view, vs, ve, ppd])

  const dagOff = (iso: string) => dagOffset(iso, vs)
  const xVoor  = (iso: string) => Math.max(0, Math.min(totalW, dagOff(iso) * ppd))

  return { view, peildatum, vs, ve, ppd, totalDays, totalW, spans, cols, gridUnits, dagOffset: dagOff, xVoor }
}
