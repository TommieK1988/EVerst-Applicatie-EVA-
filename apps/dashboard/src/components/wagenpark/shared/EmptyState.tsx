import { cn } from '@/lib/wagenpark/utils'

type Props = {
  titel: string
  omschrijving?: string
  icon?: React.ElementType
  action?: React.ReactNode
  className?: string
}

export default function EmptyState({ titel, omschrijving, icon: Icon, action, className }: Props) {
  return (
    <div className={cn('text-center py-12 px-6 border rounded-lg bg-white', className)}>
      {Icon && (
        <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
          <Icon className="w-6 h-6 text-slate-400" />
        </div>
      )}
      <h3 className="mt-4 text-base font-medium text-slate-900">{titel}</h3>
      {omschrijving && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{omschrijving}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
