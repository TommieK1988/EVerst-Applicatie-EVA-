'use client'
import * as React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA StatCard — Data Display.html (#02). KPI-tegel met icon, waarde, trend. */
type StatTone = 'brand' | 'success' | 'warning' | 'info' | 'error' | 'lime'

const ICO_TONE: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  info: 'bg-info-50 text-info-700',
  error: 'bg-error-50 text-error-700',
  lime: 'bg-[rgba(140,198,63,0.12)] text-[#5a8a10]',
}

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  tone?: StatTone
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  trend?: { direction: 'up' | 'down' | 'flat'; value: React.ReactNode; compare?: React.ReactNode }
}

function StatCard({ className, icon, tone = 'brand', label, value, unit, trend, ...props }: StatCardProps) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus
  const trendColor =
    trend?.direction === 'up' ? 'text-success-700' : trend?.direction === 'down' ? 'text-error-500' : 'text-neutral-500'
  return (
    <div className={cn('flex items-start gap-3.5 rounded-[10px] border border-neutral-200 bg-white px-[18px] py-4', className)} {...props}>
      {icon && <div className={cn('grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px]', ICO_TONE[tone])}>{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">{label}</div>
        <div className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-neutral-900">
          {value}
          {unit && <span className="ml-[3px] text-sm font-medium text-neutral-500">{unit}</span>}
        </div>
        {trend && (
          <div className={cn('mt-1 flex items-center gap-1 text-xs font-semibold', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trend.value}
            {trend.compare && <span className="ml-[3px] font-normal text-neutral-500">{trend.compare}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export { StatCard }
