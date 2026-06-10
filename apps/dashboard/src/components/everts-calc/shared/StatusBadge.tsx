import { cn, getStatusKleur, getDisciplineKleur } from '@/lib/everts-calc/utils'
import { PROJECT_STATUSSEN, DISCIPLINES } from '@/lib/everts-calc/types'

interface StatusBadgeProps {
  status: string
  type?: 'project' | 'discipline'
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, type = 'project', size = 'md' }: StatusBadgeProps) {
  const kleurClass = type === 'discipline'
    ? getDisciplineKleur(status)
    : getStatusKleur(status)

  const label = type === 'discipline'
    ? (DISCIPLINES[status as keyof typeof DISCIPLINES] ?? status)
    : (PROJECT_STATUSSEN[status as keyof typeof PROJECT_STATUSSEN] ?? status)

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-medium',
      kleurClass,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
    )}>
      {label}
    </span>
  )
}
