'use client'
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Badge — Basiscomponenten.html (#08). pill, solid/outline × 6 tones. */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-semibold leading-tight border border-transparent',
  {
    variants: {
      variant: { solid: '', outline: 'bg-transparent' },
      tone: {
        neutral: '',
        brand: '',
        success: '',
        warning: '',
        error: '',
        info: '',
      },
      size: {
        sm: 'px-1.5 py-px text-[10px]',
        md: 'px-2 py-0.5 text-[11px]',
        lg: 'px-2.5 py-1 text-xs',
      },
    },
    compoundVariants: [
      { variant: 'solid', tone: 'neutral', className: 'bg-neutral-100 text-neutral-700' },
      { variant: 'solid', tone: 'brand', className: 'bg-brand-50 text-brand-700' },
      { variant: 'solid', tone: 'success', className: 'bg-success-50 text-success-700' },
      { variant: 'solid', tone: 'warning', className: 'bg-warning-50 text-warning-700' },
      { variant: 'solid', tone: 'error', className: 'bg-error-50 text-error-700' },
      { variant: 'solid', tone: 'info', className: 'bg-info-50 text-info-700' },
      { variant: 'outline', tone: 'neutral', className: 'text-neutral-700 border-neutral-300' },
      { variant: 'outline', tone: 'brand', className: 'text-brand-700 border-brand-300' },
      { variant: 'outline', tone: 'success', className: 'text-success-700 border-success-300' },
      { variant: 'outline', tone: 'warning', className: 'text-warning-700 border-warning-300' },
      { variant: 'outline', tone: 'error', className: 'text-error-700 border-error-300' },
      { variant: 'outline', tone: 'info', className: 'text-info-700 border-info-300' },
    ],
    defaultVariants: { variant: 'solid', tone: 'neutral', size: 'md' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, tone, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, tone, size }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
