import { ReactNode } from 'react'
import { cn } from '@/lib/taken/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  back?: ReactNode
  className?: string
}

export default function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
          {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
