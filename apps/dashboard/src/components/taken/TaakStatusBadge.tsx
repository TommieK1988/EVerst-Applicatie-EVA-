import { cn } from '@/lib/taken/utils'
import type { TaskStatus, TaskPrioriteit } from '@/lib/taken/supabase/database.types'

const STATUS_CONFIG: Record<TaskStatus, { label: string; klasse: string }> = {
  open:           { label: 'Open',           klasse: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_behandeling: { label: 'In behandeling', klasse: 'bg-blue-50 text-blue-700 border-blue-200' },
  wacht_op:       { label: 'Wacht op',       klasse: 'bg-amber-50 text-amber-700 border-amber-200' },
  gereed:         { label: 'Gereed',          klasse: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vervallen:      { label: 'Vervallen',       klasse: 'bg-red-50 text-red-600 border-red-200' },
}

const PRIORITEIT_CONFIG: Record<TaskPrioriteit, { label: string; klasse: string; dot: string }> = {
  laag:   { label: 'Laag',   klasse: 'bg-slate-50 text-slate-500 border-slate-200',  dot: 'bg-slate-400' },
  normaal:{ label: 'Normaal',klasse: 'bg-slate-50 text-slate-600 border-slate-200',  dot: 'bg-slate-500' },
  hoog:   { label: 'Hoog',   klasse: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', klasse: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500' },
}

interface StatusBadgeProps {
  status: TaskStatus
  size?: 'sm' | 'md'
}

interface PrioriteitBadgeProps {
  prioriteit: TaskPrioriteit
  size?: 'sm' | 'md'
}

export function TaakStatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.open
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-medium',
      config.klasse,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
    )}>
      {config.label}
    </span>
  )
}

export function TaakPrioriteitBadge({ prioriteit, size = 'md' }: PrioriteitBadgeProps) {
  const config = PRIORITEIT_CONFIG[prioriteit] ?? PRIORITEIT_CONFIG.normaal
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      config.klasse,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
      {config.label}
    </span>
  )
}

export { STATUS_CONFIG, PRIORITEIT_CONFIG }
