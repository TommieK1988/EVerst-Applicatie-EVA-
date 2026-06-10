'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/** EVA Card — Overlays en Containers.html (#05). radius 10px (xl), border-first, flat. */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-white border border-neutral-200 rounded-[10px] overflow-hidden',
      interactive &&
        'cursor-pointer transition-[border-color,box-shadow,transform] [transition-duration:120ms] hover:border-brand-300 hover:shadow-[0_4px_8px_-2px_rgba(16,24,40,0.08)] hover:-translate-y-px',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between border-b border-neutral-200 px-[18px] py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-700',
        className,
      )}
      {...props}
    />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-[18px] py-[18px] text-[13.5px] text-neutral-800', className)} {...props} />
  ),
)
CardBody.displayName = 'CardBody'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center justify-end gap-2 border-t border-neutral-200 px-[18px] py-3', className)}
      {...props}
    />
  ),
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardBody, CardFooter }
