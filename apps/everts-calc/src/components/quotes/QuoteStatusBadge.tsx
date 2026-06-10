import { cn } from '@/lib/utils'
import type { QuoteStatus } from '@/lib/types-quotes'

const CONFIG: Record<QuoteStatus, { label: string; cls: string }> = {
  concept:      { label: 'Concept',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  verzonden:    { label: 'Verzonden',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  geaccepteerd: { label: 'Geaccepteerd', cls: 'bg-green-50 text-green-700 border-green-200' },
  afgewezen:    { label: 'Afgewezen',    cls: 'bg-red-50 text-red-600 border-red-200' },
  verlopen:     { label: 'Verlopen',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export default function QuoteStatusBadge({
  status,
  className,
}: {
  status: QuoteStatus
  className?: string
}) {
  const { label, cls } = CONFIG[status] ?? CONFIG.concept
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', cls, className)}>
      {label}
    </span>
  )
}
