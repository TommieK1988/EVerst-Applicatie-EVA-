'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/** EVA EmptyState — Feedback en States.html (#06). Gecentreerd, art-tegel + titel + desc + acties. */
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  tone?: 'brand' | 'neutral'
  size?: 'sm' | 'md'
}

function EmptyState({
  className,
  icon,
  title,
  description,
  actions,
  tone = 'brand',
  size = 'md',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center text-center', size === 'sm' ? 'px-5 py-7' : 'px-8 py-12', className)}
      {...props}
    >
      {icon && (
        <div
          className={cn(
            'mb-[18px] grid place-items-center rounded-[14px]',
            size === 'sm' ? 'mb-3 h-10 w-10 rounded-[10px]' : 'h-14 w-14',
            tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-500',
          )}
        >
          {icon}
        </div>
      )}
      <div className="mb-1.5 text-base font-bold tracking-[-0.01em] text-neutral-900">{title}</div>
      {description && (
        <div className="mb-[18px] max-w-[320px] text-[13px] leading-normal text-neutral-600">{description}</div>
      )}
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export { EmptyState }
