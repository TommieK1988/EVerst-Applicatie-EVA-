'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/**
 * EVA PageHeader — Navigatie en Layout.html (#04). Sterkste herhalende patroon.
 * eyebrow (UPPERCASE context) · breadcrumb-title (titel ÍS het pad, › scheiders)
 * · status-pill (optioneel, onder titel) · actie-cluster rechts. Eén primary per scherm.
 * Leeft IN de page-area en scrollt mee.
 */
type StatusTone = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_TONE: Record<StatusTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  error: 'bg-error-50 text-error-700',
  info: 'bg-info-50 text-info-700',
  neutral: 'bg-neutral-100 text-neutral-700',
}

export interface PageHeaderProps {
  eyebrow?: string
  /** Titel als string, of een pad-array dat met › scheiders wordt weergegeven. */
  title: string | string[]
  status?: { label: string; tone?: StatusTone; dot?: boolean }
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, status, actions, className }: PageHeaderProps) {
  const segments = Array.isArray(title) ? title : [title]
  return (
    <div className={cn('flex items-start justify-between gap-6 mb-[22px]', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-500">
            {eyebrow}
          </div>
        )}
        <h1 className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900">
          {segments.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="mx-2 font-medium text-neutral-400">›</span>}
              {seg}
            </React.Fragment>
          ))}
        </h1>
        {status && (
          <span
            className={cn(
              'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold',
              STATUS_TONE[status.tone ?? 'brand'],
            )}
          >
            {status.dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {status.label}
          </span>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-1.5">{actions}</div>}
    </div>
  )
}
