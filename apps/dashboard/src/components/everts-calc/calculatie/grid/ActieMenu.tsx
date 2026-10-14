'use client'

import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/everts-calc/utils'

/** Acties op één regel die het grid uitvoert (de rest regelt de rij zelf). */
export type RegelActie = 'dupliceren' | 'kopieren' | 'verplaatsen' | 'verwijderen'

export type ActieItem =
  | { soort?: 'item'; label: ReactNode; onSelect: () => void; sneltoets?: string; icoon?: ReactNode; gevaarlijk?: boolean; uit?: boolean; extra?: ReactNode }
  | { soort: 'scheiding' }
  | { soort: 'kop'; label: string }

/**
 * Het ⋯-menu achter een regel, groep of structuurregel: alle acties op één vaste,
 * zichtbare plek in plaats van achter hover, dubbelklik of een Ctrl-klik.
 *
 * `open`/`onOpenChange` zijn optioneel: een rij die het menu ook op rechtsklik opent,
 * stuurt het zelf aan.
 */
export function ActieMenu({ items, open, onOpenChange, label = 'Acties', licht = false, className }: {
  items: (ActieItem | false | null | undefined)[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  label?: string
  /** Op een donkere groepskop: lichte knop. */
  licht?: boolean
  className?: string
}) {
  const lijst = items.filter((i): i is ActieItem => !!i)
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={e => e.stopPropagation()}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors',
            licht
              ? 'text-white/70 hover:bg-white/15 hover:text-white data-[state=open]:bg-white/20 data-[state=open]:text-white'
              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-800',
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end" sideOffset={4} collisionPadding={8}
          onClick={e => e.stopPropagation()}
          // Geen focus terug naar de knop: "Hernoemen" zet een invoerveld open, en die
          // terugkerende focus zou het meteen weer sluiten.
          onCloseAutoFocus={e => e.preventDefault()}
          className="z-[200] min-w-[230px] rounded-[10px] border border-neutral-200 bg-white py-1 shadow-xl"
        >
          {lijst.map((item, i) => {
            if (item.soort === 'scheiding') return <DropdownMenu.Separator key={i} className="my-1 h-px bg-neutral-100" />
            if (item.soort === 'kop') {
              return (
                <DropdownMenu.Label key={i} className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                  {item.label}
                </DropdownMenu.Label>
              )
            }
            return (
              <DropdownMenu.Item
                key={i}
                disabled={item.uit}
                onSelect={item.onSelect}
                className={cn(
                  'mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none',
                  'data-[highlighted]:bg-neutral-50 data-[disabled]:cursor-default data-[disabled]:opacity-40',
                  item.gevaarlijk ? 'text-error-700 data-[highlighted]:bg-error-50' : 'text-neutral-700',
                )}
              >
                {item.icoon && <span className="flex w-4 justify-center text-neutral-400">{item.icoon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.extra}
                {item.sneltoets && <span className="text-[10.5px] text-neutral-400">{item.sneltoets}</span>}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Vinkje vóór een regel: selecteren zonder Ctrl-klik. Shift-klik selecteert een reeks. */
export function SelectieVinkje({ aan, onWissel, label }: {
  aan: boolean
  onWissel: (shift: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={aan}
      aria-label={label}
      title={aan ? 'Selectie opheffen' : 'Selecteren (Shift-klik: reeks)'}
      // Shift-klik zou anders ook de tekst tussen de twee regels selecteren.
      onMouseDown={e => { if (e.shiftKey) e.preventDefault() }}
      onClick={e => { e.stopPropagation(); onWissel(e.shiftKey) }}
      className={cn(
        'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors',
        aan ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-300 bg-white hover:border-brand-500',
      )}
    >
      {aan && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
