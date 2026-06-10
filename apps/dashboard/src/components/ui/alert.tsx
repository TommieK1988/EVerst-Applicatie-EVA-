'use client'
import * as React from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA Alert — Feedback en States.html (#02). Inline alert, 5 tonen, icon + body + close. */
type AlertTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONE_STYLES: Record<AlertTone, { box: string; ico: string }> = {
  success: { box: 'bg-success-50 border-success-100 text-success-900', ico: 'text-success-700' },
  warning: { box: 'bg-warning-50 border-warning-100 text-warning-900', ico: 'text-warning-700' },
  error: { box: 'bg-error-50 border-error-100 text-error-900', ico: 'text-error-700' },
  info: { box: 'bg-info-50 border-info-100 text-info-900', ico: 'text-info-700' },
  neutral: { box: 'bg-neutral-50 border-neutral-200 text-neutral-900', ico: 'text-neutral-700' },
}

const TONE_ICON: Record<AlertTone, React.ElementType> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  neutral: Info,
}

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone
  title?: React.ReactNode
  icon?: React.ReactNode
  onClose?: () => void
  actions?: React.ReactNode
}

function Alert({ className, tone = 'info', title, icon, onClose, actions, children, ...props }: AlertProps) {
  const styles = TONE_STYLES[tone]
  const Ico = TONE_ICON[tone]
  return (
    <div
      role="alert"
      className={cn('grid grid-cols-[20px_1fr_auto] items-start gap-3.5 rounded-lg border px-4 py-3.5', styles.box, className)}
      {...props}
    >
      <span className={cn('grid place-items-center pt-px', styles.ico)}>
        {icon ?? <Ico className="h-5 w-5" />}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        {title && <div className="text-[13.5px] font-semibold leading-snug">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
        {actions && <div className="mt-2 flex gap-2">{actions}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded opacity-60 transition hover:bg-black/[0.06] hover:opacity-100"
          aria-label="Sluiten"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export { Alert }
