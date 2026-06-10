'use client'
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@everts/ui'

/** EVA Label — field-label: 10.5px / 600 / 0.08em UPPERCASE (DS typografie). */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { uppercase?: boolean }
>(({ className, uppercase = false, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-[13px] font-medium text-neutral-700 leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
      uppercase && 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500',
      className,
    )}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
