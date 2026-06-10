'use client'
import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@everts/ui'

/** EVA Radio — Basiscomponenten.html (#04). 16px circle, 6px brand-500 dot. */
const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2.5', className)} {...props} />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'h-4 w-4 shrink-0 grid place-items-center rounded-full border-[1.5px] border-neutral-300 bg-white outline-none transition-[border-color,box-shadow] [transition-duration:120ms]',
      'hover:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100',
      'data-[state=checked]:border-brand-500 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:border-neutral-200',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="h-1.5 w-1.5 rounded-full bg-brand-500" />
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
