'use client'
import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@everts/ui'

/**
 * EVA Toast — Feedback en States.html (#01). Rechtsboven, max 3 gestapeld.
 * Timing: success/info 3.5s · warning 5s · error 10s · met-actie persistent.
 * 3px linker-accentstrip per tone.
 */
type ToastTone = 'success' | 'warning' | 'error' | 'info'

const TONE_STRIP: Record<ToastTone, string> = {
  success: 'before:bg-success-500',
  warning: 'before:bg-warning-500',
  error: 'before:bg-error-500',
  info: 'before:bg-info-500',
}
const TONE_ICO: Record<ToastTone, string> = {
  success: 'text-success-500',
  warning: 'text-warning-500',
  error: 'text-error-500',
  info: 'text-info-500',
}
const TONE_ICON: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
}
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 10000,
}

type ToastItem = {
  id: string
  tone: ToastTone
  title: string
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}

type ToastContextValue = {
  toast: (t: Omit<ToastItem, 'id'>) => void
  success: (title: string, opts?: Partial<ToastItem>) => void
  warning: (title: string, opts?: Partial<ToastItem>) => void
  error: (title: string, opts?: Partial<ToastItem>) => void
  info: (title: string, opts?: Partial<ToastItem>) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const MAX_STACK = 3

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setItems((prev) => [...prev.slice(-(MAX_STACK - 1)), { ...t, id }])
  }, [])

  const api = React.useMemo<ToastContextValue>(() => {
    const make = (tone: ToastTone) => (title: string, opts?: Partial<ToastItem>) =>
      toast({ tone, title, ...opts })
    return { toast, success: make('success'), warning: make('warning'), error: make('error'), info: make('info') }
  }, [toast])

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((t) => {
          const Ico = TONE_ICON[t.tone]
          const duration = t.action ? Number.POSITIVE_INFINITY : t.duration ?? DEFAULT_DURATION[t.tone]
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={Number.isFinite(duration) ? duration : 1000000000}
              onOpenChange={(open) => !open && remove(t.id)}
              className={cn(
                'relative grid w-[360px] grid-cols-[20px_1fr_auto] items-start gap-3 overflow-hidden rounded-[10px] border border-neutral-100 bg-white py-3.5 pl-4 pr-3.5 shadow-[0_12px_24px_-6px_rgba(16,24,40,0.14),0_4px_8px_-2px_rgba(16,24,40,0.05)]',
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
                TONE_STRIP[t.tone],
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-right data-[swipe=end]:animate-out',
              )}
            >
              <span className={cn('grid place-items-center pt-px', TONE_ICO[t.tone])}>
                <Ico className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <ToastPrimitive.Title className="text-[13px] font-semibold leading-snug text-neutral-900">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="text-[12.5px] leading-snug text-neutral-600">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
                {t.action && (
                  <div className="mt-1.5 flex gap-3">
                    <ToastPrimitive.Action
                      altText={t.action.label}
                      onClick={t.action.onClick}
                      className={cn('text-[12.5px] font-semibold hover:underline', TONE_ICO[t.tone])}
                    >
                      {t.action.label}
                    </ToastPrimitive.Action>
                  </div>
                )}
              </div>
              <ToastPrimitive.Close
                className="grid h-5 w-5 place-items-center rounded text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Sluiten"
              >
                <X className="h-3.5 w-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport className="fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}
