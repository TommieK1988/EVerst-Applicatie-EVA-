'use client'
import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@everts/ui'

/** EVA Separator — Basiscomponenten.html (#10). Horizontaal/verticaal + labeled. */
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'bg-neutral-200 shrink-0',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-6 w-px self-stretch',
      className,
    )}
    {...props}
  />
))
Separator.displayName = SeparatorPrimitive.Root.displayName

function LabeledSeparator({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500',
        "before:content-[''] before:flex-1 before:h-px before:bg-neutral-200",
        "after:content-[''] after:flex-1 after:h-px after:bg-neutral-200",
        className,
      )}
    >
      {children}
    </div>
  )
}

export { Separator, LabeledSeparator }
