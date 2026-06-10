'use client'
import * as React from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import { cn } from '@everts/ui'

/**
 * EVA Combobox — Formulierpatronen.html (#04). cmdk + Popover, 300ms debounce async,
 * inline "+ nieuw aanmaken". Gebruik voor RelatieZoekveld / MateriaalZoekveld.
 */
export interface ComboboxOption {
  value: string
  label: string
  sub?: string
  badge?: string
  group?: string
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  onSearch?: (query: string) => void
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  className?: string
  disabled?: boolean
}

export function Combobox({
  options, value, onChange, placeholder = 'Selecteer…', searchPlaceholder = 'Zoeken…',
  emptyText = 'Geen resultaten.', onSearch, onCreate, createLabel, className, disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const selected = options.find((o) => o.value === value)

  // 300ms debounce voor async search
  React.useEffect(() => {
    if (!onSearch) return
    const t = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, onSearch])

  const groups = React.useMemo(() => {
    const map = new Map<string, ComboboxOption[]>()
    for (const o of options) {
      const g = o.group ?? ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(o)
    }
    return [...map.entries()]
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white pl-3 pr-2.5 text-[13px] outline-none transition-[border-color,box-shadow] [transition-duration:120ms]',
            'hover:border-neutral-400 focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100 data-[state=open]:border-brand-500 data-[state=open]:ring-[3px] data-[state=open]:ring-brand-100',
            'disabled:cursor-not-allowed disabled:bg-neutral-50',
            className,
          )}
        >
          <span className={cn('truncate', selected ? 'text-neutral-900' : 'text-neutral-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={!onSearch} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="h-10 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-neutral-500">
              {emptyText}
            </Command.Empty>
            {groups.map(([group, opts]) => (
              <Command.Group
                key={group || 'default'}
                heading={group || undefined}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-neutral-500"
              >
                {opts.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={o.label}
                    onSelect={() => { onChange?.(o.value); setOpen(false) }}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 transition-colors data-[selected=true]:bg-neutral-50',
                      o.value === value && 'bg-brand-50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium leading-tight text-neutral-900">{o.label}</div>
                      {o.sub && <div className="mt-0.5 text-[11.5px] text-neutral-500">{o.sub}</div>}
                    </div>
                    {o.badge && (
                      <span className="ml-auto shrink-0 rounded-full bg-brand-50 px-[7px] py-0.5 text-[10.5px] font-semibold text-brand-700">
                        {o.badge}
                      </span>
                    )}
                    {o.value === value && <Check className="ml-auto h-4 w-4 shrink-0 text-brand-500" />}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
          {onCreate && query && (
            <div className="flex border-t border-neutral-100 p-2">
              <button
                type="button"
                onClick={() => { onCreate(query); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50"
              >
                <Plus className="h-4 w-4" />
                {createLabel ? createLabel(query) : `"${query}" aanmaken`}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
