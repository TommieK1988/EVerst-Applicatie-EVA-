'use client'
import * as React from 'react'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA Kanban + DossierKaart — Data Display.html (#04). */
type ColStatus = 'new' | 'prog' | 'wait' | 'done'

const COL_DOT: Record<ColStatus, string> = {
  new: 'bg-brand-500',
  prog: 'bg-info-500',
  wait: 'bg-warning-500',
  done: 'bg-success-500',
}

function KanbanBoard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid grid-cols-4 items-start gap-3.5', className)} {...props} />
}

function KanbanColumn({
  title, status = 'new', count, className, children, onAdd,
}: {
  title: React.ReactNode
  status?: ColStatus
  count?: number
  className?: string
  children?: React.ReactNode
  onAdd?: () => void
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-700">
        <span className={cn('h-2 w-2 rounded-full', COL_DOT[status])} />
        {title}
        {count != null && (
          <span className="ml-auto rounded-full bg-neutral-200 px-[7px] py-px text-[10.5px] font-semibold text-neutral-600">
            {count}
          </span>
        )}
      </div>
      {children}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-1.5 rounded-[7px] border border-dashed border-neutral-300 px-3 py-[7px] text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Toevoegen
        </button>
      )}
    </div>
  )
}

export interface DossierKaartProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  dossierId?: React.ReactNode
  title: React.ReactNode
  client?: React.ReactNode
  amount?: React.ReactNode
  meta?: React.ReactNode
  priorityHigh?: boolean
  draggable?: boolean
}

const DossierKaart = React.forwardRef<HTMLDivElement, DossierKaartProps>(
  ({ className, dossierId, title, client, amount, meta, priorityHigh, draggable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border border-neutral-200 bg-white px-3.5 py-3 transition-[box-shadow,transform] [transition-duration:140ms] hover:-translate-y-px hover:shadow-[0_4px_8px_-2px_rgba(16,24,40,0.10)]',
        draggable && 'cursor-grab',
        className,
      )}
      {...props}
    >
      {priorityHigh && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-sm bg-error-500" />}
      {draggable && <GripVertical className="absolute right-2 top-2 h-3.5 w-3.5 text-neutral-300" />}
      {dossierId && <div className="mb-[5px]  text-[10px] text-neutral-400">{dossierId}</div>}
      <div className="mb-[3px] text-[12.5px] font-semibold leading-tight text-neutral-900">{title}</div>
      {client && <div className="mb-[9px] truncate text-[11.5px] text-neutral-500">{client}</div>}
      {(amount || meta) && (
        <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
          {amount && <span className=" text-xs font-semibold text-neutral-800">{amount}</span>}
          {meta && <span className="flex items-center gap-[5px] text-[11px] text-neutral-500">{meta}</span>}
        </div>
      )}
    </div>
  ),
)
DossierKaart.displayName = 'DossierKaart'

export { KanbanBoard, KanbanColumn, DossierKaart }
