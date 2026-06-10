import { cn, getStatusColor } from '@/lib/houtrotherstel/utils'
import {
  REGISTRATIE_STATUSSEN,
  PROJECT_STATUSSEN,
  CONTROL_STATUSSEN,
  SCHADE_SEVERITY,
} from '@/lib/houtrotherstel/types'

interface StatusBadgeProps {
  status: string
  type?: 'registratie' | 'project' | 'control' | 'schade'
  size?: 'sm' | 'md'
}

function getLabel(status: string, type: string): string {
  if (type === 'project' && status in PROJECT_STATUSSEN) {
    return PROJECT_STATUSSEN[status as keyof typeof PROJECT_STATUSSEN]
  }
  if (type === 'control' && status in CONTROL_STATUSSEN) {
    return CONTROL_STATUSSEN[status as keyof typeof CONTROL_STATUSSEN]
  }
  if (type === 'schade' && status in SCHADE_SEVERITY) {
    return SCHADE_SEVERITY[status as keyof typeof SCHADE_SEVERITY]
  }
  if (status in REGISTRATIE_STATUSSEN) {
    return REGISTRATIE_STATUSSEN[status as keyof typeof REGISTRATIE_STATUSSEN]
  }
  return status
}

export default function StatusBadge({
  status,
  type = 'registratie',
  size = 'md',
}: StatusBadgeProps) {
  const colorClass = getStatusColor(status)
  const label = getLabel(status, type)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        colorClass,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        false
      )}
    >
      {label}
    </span>
  )
}
