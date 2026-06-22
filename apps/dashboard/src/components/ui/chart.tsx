'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/** EVA Chart — Data Display.html (#05). Recharts-wrapper + DS chart-palet + chart-card. */

/** Green-forward chart-palet (DS). Gebruik als `fill`/`stroke` in Recharts series. */
export const CHART_COLORS = [
  '#009439', // chart-1
  '#28a44a', // chart-2
  '#61ac2b', // chart-3
  '#2e90fa', // chart-4
  '#f08000', // chart-5
  '#e8453b', // chart-6
  '#8b5cf6', // chart-7
  '#14b8a6', // chart-8
] as const

export const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length]

/** Categorisch palet met contrasterende tinten — voor pie-/verdeling-charts
 *  waar aangrenzende segmenten goed te onderscheiden moeten zijn. */
export const CHART_CATEGORICAL = [
  '#009439', // groen
  '#2e90fa', // blauw
  '#f08000', // oranje
  '#8b5cf6', // paars
  '#e8453b', // rood
  '#14b8a6', // teal
  '#eab308', // geel
  '#ec4899', // roze
] as const

export const categoricalColor = (i: number) => CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]

/** Gestileerde container voor een grafiek (border-first, brand-watermerk optioneel). */
export interface ChartCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  watermark?: boolean
}

function ChartCard({ className, title, subtitle, watermark, children, ...props }: ChartCardProps) {
  return (
    <div className={cn('relative rounded-[10px] border border-neutral-200 bg-white px-[22px] py-5', className)} {...props}>
      {watermark && (
        <div
          className="pointer-events-none absolute right-4 top-4 h-[22px] w-[22px] opacity-45"
          style={{ background: "url('/logo-beeldmerk.svg') center/contain no-repeat" }}
        />
      )}
      {title && <div className="mb-[3px] text-sm font-bold text-neutral-900">{title}</div>}
      {subtitle && <div className="mb-4 text-xs text-neutral-500">{subtitle}</div>}
      {children}
    </div>
  )
}

/** Tooltip-styling voor Recharts (geef door aan <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />). */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid #e3e8ea',
  boxShadow: '0 4px 8px -2px rgba(16,24,40,0.08)',
  fontSize: 12,
  padding: '8px 10px',
}

export const CHART_AXIS_PROPS = {
  tick: { fontSize: 11, fill: '#6b757c' },
  stroke: '#e3e8ea',
} as const

export { ChartCard }
