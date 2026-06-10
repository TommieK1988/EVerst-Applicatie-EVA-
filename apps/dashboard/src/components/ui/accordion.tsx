'use client'
import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA Accordion — Overlays en Containers.html (#04). Radix Accordion, DS-styling. */
const Accordion = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Root
    ref={ref}
    className={cn('overflow-hidden rounded-[10px] border border-neutral-200', className)}
    {...(props as React.ComponentProps<typeof AccordionPrimitive.Root>)}
  />
))
Accordion.displayName = 'Accordion'

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-t border-neutral-200 first:border-t-0', className)}
    {...props}
  />
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { badge?: React.ReactNode }
>(({ className, children, badge, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex w-full items-center gap-3 px-[18px] py-3.5 text-left text-[13.5px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100',
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      {badge != null && (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 group-data-[state=open]:bg-brand-50 group-data-[state=open]:text-brand-700">
          {badge}
        </span>
      )}
      <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform [transition-duration:240ms] group-data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = 'AccordionTrigger'

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden bg-neutral-50 text-[13px] leading-relaxed text-neutral-700 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('px-[18px] pb-[18px] pt-1', className)}>{children}</div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = 'AccordionContent'

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
