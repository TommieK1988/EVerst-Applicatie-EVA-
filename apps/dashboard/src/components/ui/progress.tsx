'use client'
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Progress — Feedback en States.html (#07). 6px track, brand fill, tones + sizes. */
const trackVariants = cva('relative w-full overflow-hidden rounded-full bg-neutral-200', {
  variants: { size: { sm: 'h-1', md: 'h-1.5', lg: 'h-2' } },
  defaultVariants: { size: 'md' },
})

const TONE: Record<string, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
}

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof trackVariants> {
  value?: number
  tone?: keyof typeof TONE
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value = 0, size, tone = 'brand', ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} className={cn(trackVariants({ size }), className)} value={value} {...props}>
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-transform duration-300 ease-out', TONE[tone])}
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  ),
)
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
