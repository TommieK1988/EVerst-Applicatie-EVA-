'use client'
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@everts/ui'

/** EVA Tooltip — Basiscomponenten.html (#11). neutral-900 bg, 11.5px, pijl. */
const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 inline-flex items-center gap-2 rounded-[5px] bg-neutral-900 px-[9px] py-1.5 text-[11.5px] font-medium text-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.18),0_2px_4px_-2px_rgba(16,24,40,0.08)]',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="fill-neutral-900" width={8} height={4} />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

function TooltipKbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[3px] bg-neutral-700 px-[5px] py-px  text-[10px] text-neutral-200">
      {children}
    </span>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipKbd }
