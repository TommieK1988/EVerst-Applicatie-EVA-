'use client'
import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Switch — Basiscomponenten.html. 32×18 track, brand-500 on, witte knop. */
const switchVariants = cva(
  'peer inline-flex shrink-0 items-center rounded-full bg-neutral-300 transition-colors [transition-duration:160ms] outline-none cursor-pointer hover:bg-neutral-400 focus-visible:ring-[3px] focus-visible:ring-brand-100 data-[state=checked]:bg-brand-500 data-[state=checked]:hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:data-[state=checked]:bg-brand-200',
  {
    variants: {
      size: { sm: 'h-3.5 w-[26px]', md: 'h-[18px] w-8' },
    },
    defaultVariants: { size: 'md' },
  },
)

const thumbVariants = cva(
  'pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
  {
    variants: {
      size: {
        sm: 'h-2.5 w-2.5 translate-x-0.5 data-[state=checked]:translate-x-[13px]',
        md: 'h-3.5 w-3.5 translate-x-0.5 data-[state=checked]:translate-x-[16px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, size, ...props }, ref) => (
    <SwitchPrimitive.Root ref={ref} className={cn(switchVariants({ size }), className)} {...props}>
      <SwitchPrimitive.Thumb className={thumbVariants({ size })} />
    </SwitchPrimitive.Root>
  ),
)
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
