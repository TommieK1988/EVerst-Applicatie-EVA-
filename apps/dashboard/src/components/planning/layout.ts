'use client'

import React, { useMemo } from 'react'
import {
  addDays, addMonths, differenceInDays,
  format, getISOWeek, isToday as dateFnsIsToday, isWeekend,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import { nl } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

export type View = 'dag' | 'week' | '2weken' | 'maand' | 'kwartaal'

export type HSpan = {
  key:   string
  left:  number
  width: number
  label: string
}

export type HCol = {
  key:       string
  left:      number
  width:     number
  label:     string
  subLabel?: string
  isToday:   boolean
  isWeekend: boolean
  isBorder:  boolean
  date:      Date
}

export type GridUnit = {
  key:            string
  left:           number
  width:          number
  isToday:        boolean
  isWeekend:      boolean
  borderStrength: 'major' | 'minor' | 'none'
}

export type PlanningLayout = {
  ppd:        number
  totalDays:  number
  totalW:     number
  vs:         Date
  ve:         Date
  spans:      HSpan[]
  cols:       HCol[]
  gridUnits:  GridUnit[]
  dagOffset?: (iso: string) => number
  xVoor?:     (iso: string) => number
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const RIJ_HOOGTE = 48
export const LABEL_W    = 240

export const KLEUR = {
  border:  'var(--border, #e3e8ea)',
  fg:      'var(--fg, #161b20)',
  fgMuted: 'var(--fg-muted, #6b757c)',
  bgElev:  'var(--bg-elev, #f8fafa)',
}

// ─── View range ───────────────────────────────────────────────────────────────

export function viewBereik(
  view: View,
  peildatum: Date,
): { vs: Date; ve: Date; totalDays: number } {
  switch (view) {
    case 'dag': {
      const vs = startOfDay(peildatum)
      return { vs, ve: vs, totalDays: 1 }
    }
    case 'week': {
      const vs = startOfWeek(peildatum, { weekStartsOn: 1 })
      return { vs, ve: addDays(vs, 6), totalDays: 7 }
    }
    case '2weken': {
      const vs = startOfWeek(peildatum, { weekStartsOn: 1 })
      return { vs, ve: addDays(vs, 13), totalDays: 14 }
    }
    case 'maand': {
      const vs = startOfMonth(peildatum)
      return { vs, ve: addDays(vs, 34), totalDays: 35 }
    }
    case 'kwartaal': {
      const vs = startOfMonth(peildatum)
      return { vs, ve: addDays(vs, 90), totalDays: 91 }
    }
  }
}

// ─── Header builder ───────────────────────────────────────────────────────────

export function buildHeader(
  view: View,
  vs: Date,
  ve: Date,
  ppd: number,
): { spans: HSpan[]; cols: HCol[] } {
  const days: Date[] = []
  let cur = startOfDay(vs)
  const veDay = startOfDay(ve)
  while (cur <= veDay) {
    days.push(cur)
    cur = addDays(cur, 1)
  }

  const cols: HCol[] = days.map((d, i) => {
    const left     = i * ppd
    const wd       = d.getDay()
    const isMa     = wd === 1
    const isBorder =
      (view === 'maand'    && isMa) ||
      (view === '2weken'   && isMa) ||
      (view === 'kwartaal' && d.getDate() === 1)

    let label: string
    let subLabel: string | undefined

    if (view === 'dag') {
      label = format(d, 'EEEE d MMMM', { locale: nl })
    } else if (view === 'week' || view === '2weken') {
      label    = format(d, 'EE', { locale: nl })
      subLabel = String(d.getDate())
    } else if (view === 'maand') {
      label    = String(d.getDate())
      subLabel = isMa ? `w${getISOWeek(d)}` : undefined
    } else {
      // kwartaal
      label = d.getDate() === 1 ? format(d, 'MMM', { locale: nl }) : String(d.getDate())
    }

    return {
      key: d.toISOString().slice(0, 10),
      left,
      width:     ppd,
      label,
      subLabel,
      isToday:   dateFnsIsToday(d),
      isWeekend: isWeekend(d),
      isBorder,
      date: d,
    }
  })

  // Spans (top row: month or week groupings)
  const spans: HSpan[] = []

  if (view === 'dag') {
    spans.push({ key: 'main', left: 0, width: ppd, label: format(vs, 'd MMMM yyyy', { locale: nl }) })
  } else if (view === 'week') {
    spans.push({
      key: 'w',
      left: 0,
      width: 7 * ppd,
      label: `Week ${getISOWeek(vs)} · ${format(vs, 'MMMM yyyy', { locale: nl })}`,
    })
  } else if (view === '2weken') {
    for (let w = 0; w < 2; w++) {
      const wd = addDays(vs, w * 7)
      spans.push({ key: `w${w}`, left: w * 7 * ppd, width: 7 * ppd, label: `Week ${getISOWeek(wd)}` })
    }
  } else {
    // maand / kwartaal: group days by month
    let spanStart = 0
    let curMonth  = vs.getMonth()
    let curYear   = vs.getFullYear()

    for (let i = 1; i <= days.length; i++) {
      const d = days[i]
      const newMonth = !d || d.getMonth() !== curMonth || d.getFullYear() !== curYear
      if (newMonth) {
        spans.push({
          key:   `m-${curYear}-${curMonth}`,
          left:  spanStart * ppd,
          width: (i - spanStart) * ppd,
          label: format(new Date(curYear, curMonth, 1), 'MMMM yyyy', { locale: nl }),
        })
        if (d) {
          spanStart = i
          curMonth  = d.getMonth()
          curYear   = d.getFullYear()
        }
      }
    }
  }

  return { spans, cols }
}

// ─── Grid units ───────────────────────────────────────────────────────────────

export function buildGridUnits(
  view: View,
  vs: Date,
  ve: Date,
  ppd: number,
): GridUnit[] {
  const units: GridUnit[] = []
  let cur = startOfDay(vs)
  let i   = 0
  const veDay = startOfDay(ve)

  while (cur <= veDay) {
    const wd      = cur.getDay()
    const weekend = wd === 0 || wd === 6
    const today   = dateFnsIsToday(cur)
    const isMa    = wd === 1

    const borderStrength: 'major' | 'minor' | 'none' =
      isMa                                                  ? 'major' :
      !weekend && (view === 'maand' || view === 'kwartaal') ? 'minor'  :
      'none'

    units.push({
      key: cur.toISOString().slice(0, 10),
      left: i * ppd,
      width: ppd,
      isToday:   today,
      isWeekend: weekend,
      borderStrength,
    })

    cur = addDays(cur, 1)
    i++
  }

  return units
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

export function dagOffset(date: Date | string, vs: Date): number {
  const d = typeof date === 'string' ? startOfDay(parseISO(date)) : startOfDay(date)
  return differenceInDays(d, startOfDay(vs))
}

export function verschuifTs(ts: string, days: number): string {
  return new Date(new Date(ts).getTime() + days * 86_400_000).toISOString()
}

export function verschuifDatum(dateStr: string, days: number): string {
  return format(addDays(parseISO(dateStr), days), 'yyyy-MM-dd')
}

// ─── usePlanningLayout hook ───────────────────────────────────────────────────

export function usePlanningLayout({
  peildatum,
  view,
  availableW,
}: {
  peildatum:  Date
  view:       View
  availableW: number
}): PlanningLayout {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const { totalDays, vs, ve } = viewBereik(view, peildatum)
    const ppd    = availableW > 0 ? Math.max(1, Math.floor(availableW / totalDays)) : 10
    const totalW = totalDays * ppd
    const { spans, cols } = buildHeader(view, vs, ve, ppd)
    const gridUnits       = buildGridUnits(view, vs, ve, ppd)
    return { ppd, totalDays, totalW, vs, ve, spans, cols, gridUnits }
  }, [peildatum.getTime(), view, availableW]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── PeriodeNav ───────────────────────────────────────────────────────────────

const VIEW_LABELS: Record<View, string> = {
  dag:      'Dag',
  week:     'Week',
  '2weken': '2w',
  maand:    'Maand',
  kwartaal: 'Kwartaal',
}

function periodeLabel(view: View, pd: Date): string {
  switch (view) {
    case 'dag':
      return format(pd, 'd MMMM yyyy', { locale: nl })
    case 'week':
      return `Week ${getISOWeek(pd)} · ${format(startOfWeek(pd, { weekStartsOn: 1 }), 'MMMM yyyy', { locale: nl })}`
    case '2weken':
      return `${format(pd, 'd MMM', { locale: nl })} – ${format(addDays(pd, 13), 'd MMM yyyy', { locale: nl })}`
    case 'maand':
      return format(pd, 'MMMM yyyy', { locale: nl })
    case 'kwartaal':
      return `Q${Math.ceil((pd.getMonth() + 1) / 3)} ${pd.getFullYear()}`
  }
}

const NAV_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6,
  border: '1px solid var(--border, #e3e8ea)',
  background: 'transparent', cursor: 'pointer',
  fontSize: 15, color: 'var(--fg)', fontFamily: 'var(--font-ui)',
}

export function PeriodeNav({
  peildatum,
  view,
  onPeildatum,
  onView,
  onVandaag,
  rightSlot,
}: {
  peildatum:   Date
  view:        View
  onPeildatum: (d: Date) => void
  onView:      (v: View) => void
  onVandaag?:  () => void
  rightSlot?:  React.ReactNode
}) {
  function nav(dir: -1 | 1) {
    if (view === 'maand')    { onPeildatum(addMonths(peildatum, dir));     return }
    if (view === 'kwartaal') { onPeildatum(addMonths(peildatum, dir * 3)); return }
    const steps: Record<View, number> = { dag: 1, week: 7, '2weken': 14, maand: 30, kwartaal: 90 }
    onPeildatum(addDays(peildatum, dir * steps[view]))
  }

  return (
    React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', flexWrap: 'wrap' as const,
      },
    },
      React.createElement('div', { style: { display: 'flex', gap: 2, alignItems: 'center' } },
        React.createElement('button', { onClick: () => nav(-1), style: NAV_BTN, title: 'Vorige periode' }, '‹'),
        onVandaag && React.createElement('button', {
          onClick: onVandaag,
          style: { ...NAV_BTN, width: 'auto', padding: '0 8px', fontSize: 10 },
        }, 'Vandaag'),
        React.createElement('button', { onClick: () => nav(1), style: NAV_BTN, title: 'Volgende periode' }, '›'),
      ),
      React.createElement('span', {
        style: {
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
          color: 'var(--fg)', minWidth: 160,
        },
      }, periodeLabel(view, peildatum)),
      React.createElement('div', {
        style: {
          display: 'flex', gap: 2,
          background: 'var(--bg)', border: '1px solid var(--border, #e3e8ea)',
          borderRadius: 6, padding: 2, marginLeft: 'auto',
        },
      },
        ...(['dag', 'week', '2weken', 'maand', 'kwartaal'] as View[]).map(v =>
          React.createElement('button', {
            key: v,
            onClick: () => onView(v),
            style: {
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? 'white' : 'var(--fg-muted)',
              fontSize: 10, fontWeight: 700,
            },
          }, VIEW_LABELS[v]),
        ),
      ),
      rightSlot
        ? React.createElement('div', { style: { marginLeft: 4 } }, rightSlot)
        : null,
    )
  )
}

// ─── PeriodeScrubber ──────────────────────────────────────────────────────────

export function PeriodeScrubber({
  view,
  peildatum,
  vs,
  onChange,
}: {
  view:      View
  peildatum: Date
  vs:        Date
  onChange:  (d: Date) => void
}) {
  const jaar     = peildatum.getFullYear()
  const { totalDays } = viewBereik(view, peildatum)
  const ve       = addDays(vs, totalDays - 1)

  const maanden: Date[] = []
  for (let m = 0; m < 12; m++) maanden.push(new Date(jaar, m, 1))

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '3px 12px', overflowX: 'auto' as const,
      borderBottom: `1px solid ${KLEUR.border}`,
    },
  },
    React.createElement('span', {
      style: {
        fontSize: 9,
        color: KLEUR.fgMuted, marginRight: 8, whiteSpace: 'nowrap' as const,
      },
    }, String(jaar)),
    React.createElement('div', { style: { display: 'flex', gap: 1 } },
      ...maanden.map(m => {
        const mLabel    = format(m, 'MMM', { locale: nl })
        const mEnd      = addDays(addMonths(m, 1), -1)
        const isActief  = vs.getFullYear() === m.getFullYear() && vs.getMonth() === m.getMonth()
        const isInRange = m <= ve && mEnd >= vs

        return React.createElement('button', {
          key:     m.getTime(),
          onClick: () => onChange(startOfMonth(m)),
          style: {
            minWidth: 32, height: 18, padding: '0 4px',
            border: 'none', borderRadius: 3, cursor: 'pointer',
            background: isActief
              ? 'var(--accent)'
              : isInRange
              ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
              : 'transparent',
            color: isActief ? 'white' : KLEUR.fgMuted,
            fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase' as const,
          },
        }, mLabel)
      }),
    ),
  )
}

// ─── PlanningShell ────────────────────────────────────────────────────────────

export function PlanningShell({
  layout,
  scrollRef,
  toolbar,
  labelHeader,
  labelKolom,
  body,
  bodyHoogte,
  legenda,
}: {
  layout:      PlanningLayout
  scrollRef?:  React.RefObject<HTMLDivElement>
  toolbar:     React.ReactNode
  labelHeader: string
  labelKolom:  React.ReactNode
  body:        React.ReactNode
  bodyHoogte:  number
  legenda?:    React.ReactNode
}) {
  const { ppd, totalDays, spans, cols } = layout
  const totalW = totalDays * ppd

  return React.createElement('div', {
    style: { border: `1px solid ${KLEUR.border}`, borderRadius: 10, overflow: 'hidden' },
  },
    // Toolbar
    React.createElement('div', { style: { borderBottom: `1px solid ${KLEUR.border}` } }, toolbar),

    // Main two-column layout
    React.createElement('div', { style: { display: 'flex', overflow: 'hidden' } },

      // Fixed label column
      React.createElement('div', {
        style: { width: LABEL_W, flexShrink: 0, borderRight: `2px solid ${KLEUR.border}` },
      },
        // Label header
        React.createElement('div', {
          style: {
            height: 52, display: 'flex', alignItems: 'center',
            paddingLeft: 16, borderBottom: `1px solid ${KLEUR.border}`,
            background: 'var(--bg-elev, #f8fafa)',
          },
        },
          React.createElement('span', {
            style: {
              fontSize: 10, fontWeight: 700,
              color: KLEUR.fgMuted, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
            },
          }, labelHeader),
        ),
        labelKolom,
      ),

      // Scrollable Gantt
      React.createElement('div', {
        ref: scrollRef,
        style: { flex: 1, overflowX: 'auto' as const, overflowY: 'hidden' as const },
      },
        // Header (spans + cols)
        React.createElement('div', {
          style: {
            minWidth: totalW,
            background: 'var(--bg-elev, #f8fafa)',
            borderBottom: `1px solid ${KLEUR.border}`,
            position: 'sticky' as const, top: 0, zIndex: 5,
          },
        },
          // Spans row
          React.createElement('div', {
            style: { position: 'relative' as const, height: 24, borderBottom: `1px solid ${KLEUR.border}` },
          },
            ...spans.map(sp =>
              React.createElement('div', {
                key: sp.key,
                style: {
                  position: 'absolute' as const, top: 0, bottom: 0,
                  left: sp.left, width: sp.width,
                  padding: '4px 8px',
                  fontSize: 11, fontWeight: 700,
                  color: KLEUR.fgMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                  borderRight: `1px solid ${KLEUR.border}`,
                  overflow: 'hidden', whiteSpace: 'nowrap' as const, boxSizing: 'border-box' as const,
                },
              }, sp.label),
            ),
          ),
          // Cols row
          React.createElement('div', {
            style: { position: 'relative' as const, height: 28 },
          },
            ...cols.map(col =>
              React.createElement('div', {
                key: col.key,
                style: {
                  position: 'absolute' as const, top: 0, bottom: 0,
                  left: col.left, width: col.width,
                  display: 'flex', flexDirection: 'column' as const,
                  alignItems: 'center', justifyContent: 'center',
                  color: col.isToday ? 'var(--accent)' : col.isWeekend ? KLEUR.fgMuted : 'var(--fg-soft, #4a555e)',
                  fontWeight: col.isToday ? 700 : 400,
                  background: col.isToday
                    ? 'rgba(31,122,58,0.08)'
                    : col.isWeekend ? 'rgba(0,0,0,0.04)' : 'transparent',
                  borderRight: `1px solid ${KLEUR.border}`,
                  borderLeft: col.isBorder ? `1px solid ${KLEUR.border}` : 'none',
                  boxSizing: 'border-box' as const, overflow: 'hidden',
                },
              },
                col.subLabel
                  ? React.createElement('span', { style: { fontSize: 7, opacity: 0.6, lineHeight: 1 } }, col.subLabel)
                  : null,
                React.createElement('span', {
                  style: { fontSize: 11, fontWeight: col.isToday ? 700 : 500 },
                }, col.label),
              ),
            ),
          ),
        ),

        // Body
        React.createElement('div', {
          style: { position: 'relative' as const, minWidth: totalW, height: bodyHoogte },
        }, body),
      ),
    ),

    // Legend
    legenda
      ? React.createElement('div', {
          style: { padding: '8px 12px', borderTop: `1px solid ${KLEUR.border}` },
        }, legenda)
      : null,
  )
}
