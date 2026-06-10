'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/**
 * EVA WerkbonKaart — WerkbonKaart.html (#09). 5 statussen sturen --wb-accent
 * (strip + pill + progressbar). Varianten: full / compact / planning-entry.
 */
export type WerkbonStatus = 'gepland' | 'onderweg' | 'bezig' | 'afgerond' | 'probleem'

type StatusCfg = { accent: string; soft: string; pill: string; label: string; live?: boolean }

export const WERKBON_STATUS: Record<WerkbonStatus, StatusCfg> = {
  gepland: { accent: '#9aa4ab', soft: '#f1f4f5', pill: '#4d575e', label: 'Gepland' },
  onderweg: { accent: '#7c3aed', soft: '#f5f3ff', pill: '#6d28d9', label: 'Onderweg', live: true },
  bezig: { accent: '#009439', soft: '#ecfaf0', pill: '#0a5e28', label: 'Bezig', live: true },
  afgerond: { accent: '#12b76a', soft: '#ecfdf3', pill: '#027a48', label: 'Afgerond' },
  probleem: { accent: '#e8453b', soft: '#fef3f2', pill: '#b42318', label: 'Probleem' },
}

function StatusPill({ status }: { status: WerkbonStatus }) {
  const cfg = WERKBON_STATUS[status]
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full py-[2px] pl-[6px] pr-[8px] text-[10px] font-semibold"
      style={{ background: cfg.soft, color: cfg.pill }}
    >
      <span className="relative grid place-items-center">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        {cfg.live && <span className="absolute h-[5px] w-[5px] animate-ping rounded-full bg-current opacity-60" />}
      </span>
      {cfg.label}
    </span>
  )
}

export interface WerkbonKaartProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  status: WerkbonStatus
  werkbonId: React.ReactNode
  dossier?: React.ReactNode
  title: React.ReactNode
  category?: React.ReactNode
  meta?: React.ReactNode
  progress?: { label?: React.ReactNode; value: number }
  tasks?: { total: number; done: number }
  footer?: React.ReactNode
  priorityHigh?: boolean
}

const WerkbonKaart = React.forwardRef<HTMLDivElement, WerkbonKaartProps>(
  ({ className, status, werkbonId, dossier, title, category, meta, progress, tasks, footer, priorityHigh, style, ...props }, ref) => {
    const cfg = WERKBON_STATUS[status]
    return (
      <div
        ref={ref}
        style={{ ['--wb-accent' as any]: cfg.accent, ...style }}
        className={cn(
          'relative flex flex-col overflow-hidden rounded-[10px] border border-neutral-200 bg-white transition-[box-shadow,transform,border-color] [transition-duration:140ms]',
          'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--wb-accent)] before:content-[""]',
          'hover:-translate-y-px hover:border-neutral-300 hover:shadow-[0_6px_16px_-4px_rgba(16,24,40,0.10)]',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2 pl-[16px] pr-[13px] pt-[11px]">
          <div className="flex min-w-0 flex-col gap-px">
            <span className="font-mono text-[10px] text-neutral-500">{werkbonId}</span>
            {dossier && <span className="font-mono text-[10px] text-neutral-400">{dossier}</span>}
          </div>
          {!priorityHigh && <StatusPill status={status} />}
        </div>

        {priorityHigh && (
          <div className="absolute right-[13px] top-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-error-50 px-[7px] py-0.5 text-[10px] font-bold tracking-[0.04em] text-error-700">
              SPOED
            </span>
          </div>
        )}

        <h3 className="pl-[16px] pr-[13px] pt-[8px] text-[12.5px] font-semibold leading-[1.3] text-neutral-900">
          {title}
        </h3>

        {category && (
          <div className="pl-[16px] pr-[13px] pt-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600">{category}</span>
          </div>
        )}

        {meta && <div className="flex flex-col gap-[5px] pl-[16px] pr-[13px] pt-[8px] text-[11px] text-neutral-600">{meta}</div>}

        {progress && (
          <div className="pl-[16px] pr-[13px] pt-[8px]">
            <div className="mb-[3px] flex items-baseline justify-between">
              <span className="text-[10px] text-neutral-400">{progress.label ?? 'Voortgang'}</span>
              <span className="font-mono text-[10px] text-neutral-400">{progress.value}%</span>
            </div>
            <div className="h-[4px] overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full rounded-full bg-[var(--wb-accent)]" style={{ width: `${progress.value}%` }} />
            </div>
            {tasks && (
              <div className="mt-[6px] flex gap-0.5">
                {Array.from({ length: tasks.total }).map((_, i) => (
                  <span key={i} className={cn('h-[3px] flex-1 rounded-sm', i < tasks.done ? 'bg-[#12b76a]' : 'bg-neutral-200')} />
                ))}
              </div>
            )}
          </div>
        )}

        {!progress && tasks && (
          <div className="pl-[16px] pr-[13px] pt-[8px]">
            <div className="mb-[3px] flex items-baseline justify-between">
              <span className="text-[10px] text-neutral-400">Voortgang</span>
              <span className="font-mono text-[10px] text-neutral-400">{tasks.done}/{tasks.total}</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: tasks.total }).map((_, i) => (
                <span key={i} className={cn('h-[3px] flex-1 rounded-sm', i < tasks.done ? 'bg-[#12b76a]' : 'bg-neutral-200')} />
              ))}
            </div>
          </div>
        )}

        {footer && (
          <div className="mt-[10px] flex items-center gap-[7px] border-t border-[#f1f4f5] pb-[10px] pl-[16px] pr-[13px] pt-[9px]">
            {footer}
          </div>
        )}
      </div>
    )
  },
)
WerkbonKaart.displayName = 'WerkbonKaart'

/** Compacte variant voor planning-kolommen. */
export interface WerkbonKaartCompactProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  status: WerkbonStatus
  time?: React.ReactNode
  werkbonId?: React.ReactNode
  title: React.ReactNode
  location?: React.ReactNode
}

const WerkbonKaartCompact = React.forwardRef<HTMLDivElement, WerkbonKaartCompactProps>(
  ({ className, status, time, werkbonId, title, location, style, ...props }, ref) => {
    const cfg = WERKBON_STATUS[status]
    return (
      <div
        ref={ref}
        style={{ ['--wb-accent' as any]: cfg.accent, ...style }}
        className={cn(
          'relative cursor-grab overflow-hidden rounded-lg border border-neutral-200 bg-white py-[9px] pl-[13px] pr-[11px] transition-[box-shadow,transform] [transition-duration:120ms]',
          'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--wb-accent)] before:content-[""]',
          'hover:-translate-y-px hover:shadow-[0_4px_10px_-3px_rgba(16,24,40,0.12)]',
          className,
        )}
        {...props}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          {time && <span className="font-mono text-[11px] font-semibold text-neutral-800">{time}</span>}
          {werkbonId && <span className="font-mono text-[9.5px] text-neutral-400">{werkbonId}</span>}
        </div>
        <div className="mb-1.5 truncate text-xs font-semibold leading-tight text-neutral-900">{title}</div>
        {location && (
          <div className="flex min-w-0 items-center gap-1 text-[11px] text-neutral-500">
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
    )
  },
)
WerkbonKaartCompact.displayName = 'WerkbonKaartCompact'

/** Day-view planning entry (absolute gepositioneerd in tijd-grid). Crew-kleur als achtergrond. */
export interface PlanningEntryProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  color?: string
  time?: React.ReactNode
  title: React.ReactNode
  location?: React.ReactNode
}

const PlanningEntry = React.forwardRef<HTMLDivElement, PlanningEntryProps>(
  ({ className, color = '#2f9e44', time, title, location, style, ...props }, ref) => (
    <div
      ref={ref}
      style={{ background: color, ...style }}
      className={cn(
        'relative cursor-grab overflow-hidden rounded-[7px] py-[7px] pl-[11px] pr-[9px] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-white/45 before:content-[""]',
        className,
      )}
      {...props}
    >
      {time && <div className="font-mono text-[10px] font-medium opacity-90">{time}</div>}
      <div className="mt-px overflow-hidden text-[11.5px] font-semibold leading-[1.25]">{title}</div>
      {location && <div className="mt-0.5 text-[10px] opacity-85">{location}</div>}
    </div>
  ),
)
PlanningEntry.displayName = 'PlanningEntry'

export { WerkbonKaart, WerkbonKaartCompact, PlanningEntry, StatusPill }
