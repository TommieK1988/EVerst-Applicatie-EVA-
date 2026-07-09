import { cn } from '@/lib/everts-calc/utils'
import type { QuoteStatus } from '@/lib/everts-calc/types-quotes'

const CONFIG: Record<QuoteStatus, { label: string; cls: string }> = {
  concept:   { label: 'Concept',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  verzonden: { label: 'Definitief', cls: 'bg-green-50 text-green-700 border-green-200' },
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
