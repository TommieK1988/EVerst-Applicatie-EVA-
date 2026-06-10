'use client'
import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA Checkbox — Basiscomponenten.html (#04). 16px, radius 4px, brand-500 checked. */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 grid place-items-center rounded border-[1.5px] border-neutral-300 bg-white outline-none transition-[background,border-color,box-shadow] [transition-duration:120ms]',
      'hover:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100',
      'data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500 data-[state=indeterminate]:bg-brand-500 data-[state=indeterminate]:border-brand-500',
      'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:border-neutral-200 disabled:data-[state=checked]:bg-neutral-300 disabled:data-[state=checked]:border-neutral-300',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
