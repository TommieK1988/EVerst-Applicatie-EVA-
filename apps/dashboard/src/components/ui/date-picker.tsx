'use client'
import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { nl } from 'date-fns/locale'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import { cn } from '@everts/ui'

/** EVA DatePicker — Formulierpatronen.html (#05). react-day-picker met DS-styling. */
function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={nl}
      showOutsideDays
      className={cn('w-[280px] p-0', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-0',
        caption: 'flex items-center justify-between border-b border-neutral-100 px-4 py-3.5',
        caption_label: 'text-[13.5px] font-bold text-neutral-900 capitalize',
        nav: 'flex items-center gap-1',
        nav_button:
          'grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900',
        nav_button_previous: 'absolute left-3',
        nav_button_next: 'absolute right-3',
        table: 'w-full border-collapse px-2.5 pb-2.5',
        head_row: 'grid grid-cols-7 gap-0.5 px-2.5 pt-2.5',
        head_cell: 'text-center text-[10.5px] font-semibold uppercase tracking-[0.04em] text-neutral-500',
        row: 'grid grid-cols-7 gap-0.5 px-2.5',
        cell: 'p-0',
        day: 'h-8 w-full rounded-md text-[12.5px] text-neutral-800 transition-colors hover:bg-neutral-100 aria-selected:opacity-100',
        day_today: 'font-bold text-brand-700',
        day_selected: 'bg-brand-500 font-semibold text-white hover:bg-brand-600',
        day_outside: 'text-neutral-400',
        day_disabled: 'cursor-not-allowed text-neutral-300 hover:bg-transparent',
        day_range_middle: 'rounded-none bg-brand-50 text-brand-700',
        day_range_start: 'rounded-r-none',
        day_range_end: 'rounded-l-none',
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export interface DatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /**
   * 'kort' toont "1 sep 2026" in plaats van "1 september 2026". Voor plekken waar de
   * datum tussen andere gegevens in een smalle kolom staat en de volledige maandnaam
   * de regel laat omslaan.
   */
  weergave?: 'lang' | 'kort'
}

export function DatePicker({ value, onChange, placeholder = 'Kies een datum', disabled, className, weergave = 'lang' }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-9 w-full items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-[13px] outline-none transition-[border-color,box-shadow] [transition-duration:120ms]',
            'hover:border-neutral-400 data-[state=open]:border-brand-500 data-[state=open]:ring-[3px] data-[state=open]:ring-brand-100 disabled:cursor-not-allowed disabled:bg-neutral-50',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-neutral-500" />
          <span className={value ? 'text-neutral-900' : 'text-neutral-400'}>
            {value ? format(value, weergave === 'kort' ? 'd MMM yyyy' : 'd MMMM yyyy', { locale: nl }) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => { onChange?.(d); setOpen(false) }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { Calendar }
