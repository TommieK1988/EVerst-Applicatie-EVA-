'use client'
import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@everts/ui'

/** EVA Popover — Overlays en Containers.html (#02). radius 10px, shadow-md, pijl. */
const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { arrow?: boolean }
>(({ className, align = 'start', sideOffset = 6, arrow = false, children, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[200px] rounded-[10px] border border-neutral-200 bg-white shadow-[0_12px_24px_-6px_rgba(16,24,40,0.12),0_4px_8px_-2px_rgba(16,24,40,0.05)] outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    >
      {children}
      {arrow && <PopoverPrimitive.Arrow className="fill-white [&>path]:stroke-neutral-200" width={11} height={5} />}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

function PopoverHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border-b border-neutral-100 px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500',
        className,
      )}
      {...props}
    />
  )
}

function PopoverBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-2', className)} {...props} />
}

const PopoverItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(({ className, active, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-[13px] text-neutral-800 transition-colors hover:bg-neutral-100',
      active && 'bg-brand-50 font-medium text-brand-700',
      className,
    )}
    {...props}
  />
))
PopoverItem.displayName = 'PopoverItem'

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent, PopoverHeader, PopoverBody, PopoverItem }
