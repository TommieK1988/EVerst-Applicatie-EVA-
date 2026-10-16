'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/**
 * EVA SegmentedControl — Navigatie en Layout.html, "Segmented control". Kies één van 2–5
 * opties die een filter of weergave binnen hetzelfde scherm wisselen. Wisselt de keuze een
 * heel deel van het scherm (ander onderdeel, andere data van de server), gebruik dan `SubTabs`.
 */
export interface SegmentedControlProps<T extends string> {
  opties: { value: T; label: React.ReactNode }[]
  waarde: T
  onChange: (waarde: T) => void
  /** Waar de keuze over gaat, voor schermlezers (bijv. "Acties van"). */
  label?: string
  className?: string
}

export function SegmentedControl<T extends string>({
  opties, waarde, onChange, label, className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex max-w-full gap-0.5 rounded-lg bg-neutral-100 p-[3px]', className)}
    >
      {opties.map(o => {
        const actief = o.value === waarde
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={actief}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-md border-0 px-3.5 py-1.5 text-[12px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-brand-100',
              actief
                ? 'bg-[var(--bg-elev)] font-semibold text-neutral-900 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'
                : 'bg-transparent font-medium text-neutral-600 hover:text-neutral-900',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
