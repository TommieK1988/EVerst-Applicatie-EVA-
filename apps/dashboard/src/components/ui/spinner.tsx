'use client'
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Spinner — Feedback en States.html (#04). brand-500, border-spin. Toon pas na 200ms. */
const spinnerVariants = cva('inline-block rounded-full border-current border-r-transparent animate-spin text-brand-500', {
  variants: {
    size: {
      sm: 'h-3.5 w-3.5 border-[1.5px]',
      md: 'h-[18px] w-[18px] border-2',
      lg: 'h-6 w-6 border-[2.5px]',
      xl: 'h-10 w-10 border-[3px]',
    },
  },
  defaultVariants: { size: 'md' },
})

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {}

function Spinner({ className, size, ...props }: SpinnerProps) {
  return <span role="status" aria-label="Laden" className={cn(spinnerVariants({ size }), className)} {...props} />
}

/** Full-page loader met optioneel bericht. */
function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="grid min-h-[280px] w-full place-items-center rounded-[10px] bg-neutral-50">
      <div className="flex flex-col items-center gap-3.5">
        <Spinner size="lg" />
        {message && <div className="text-[13px] text-neutral-600">{message}</div>}
      </div>
    </div>
  )
}

export { Spinner, FullPageLoader, spinnerVariants }
