'use client'

import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { Check, Search, X } from 'lucide-react'
import { cn } from '@everts/ui'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { zoekOpNaam } from '@/lib/taken/toewijzing'
import type { MedewerkerKeuze } from '@/app/(platform)/taken/actions/sjablonen'

export type AssigneeKeuze = { user_id: string; rol: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer' }

const ASSIGNEE_ROLLEN: { value: AssigneeKeuze['rol']; label: string }[] = [
  { value: 'verantwoordelijke', label: 'Verantwoordelijke' },
  { value: 'mede-uitvoerder',   label: 'Mede-uitvoerder' },
  { value: 'reviewer',          label: 'Reviewer' },
]

interface Props {
  medewerkers: MedewerkerKeuze[]
  gekozen: AssigneeKeuze[]
  mijnUserId: string | null
  onToggle: (userId: string) => void
  onRol: (userId: string, rol: AssigneeKeuze['rol']) => void
}

/**
 * Toewijzing bij "Nieuwe actie": de gekozen mensen als rijen (met hun rol), en een zoekveld dat
 * een keuzelijst opent. Vervangt de lange lijst vinkjes, waarin je door alle medewerkers moest
 * scrollen tot je de juiste naam tegenkwam.
 *
 * Meerdere mensen kiezen kan in één keer: de lijst blijft open tot "Klaar", Escape of een klik
 * ernaast. Jijzelf staat bovenaan; verder dezelfde volgorde als altijd (op achternaam).
 */
export function ToewijzingZoeker({ medewerkers, gekozen, mijnUserId, onToggle, onRol }: Props) {
  const [open, setOpen] = useState(false)
  const [zoekterm, setZoekterm] = useState('')

  const { metAccount, zonderAccount, naamVan } = useMemo(() => {
    const met = medewerkers.filter(m => m.auth_user_id)
    const zelf = met.filter(m => m.auth_user_id === mijnUserId)
    return {
      metAccount: [...zelf, ...met.filter(m => m.auth_user_id !== mijnUserId)],
      zonderAccount: medewerkers.filter(m => !m.auth_user_id),
      naamVan: new Map(met.map(m => [m.auth_user_id!, m.naam])),
    }
  }, [medewerkers, mijnUserId])

  const resultaten = zoekOpNaam(metAccount, zoekterm)
  // Zonder EVA-account kun je iemand geen actie geven. Alleen bij zoeken tonen, anders zoekt
  // iemand die zijn collega mist zich suf zonder te weten waarom.
  const nietToewijsbaar = zoekterm.trim() ? zoekOpNaam(zonderAccount, zoekterm) : []
  const isGekozen = (userId: string) => gekozen.some(a => a.user_id === userId)
  const jij = (userId: string) => (userId === mijnUserId ? ' (jij)' : '')

  function wisselOpen(o: boolean) {
    setOpen(o)
    if (!o) setZoekterm('')
  }

  return (
    <div className="space-y-2">
      {gekozen.length > 0 && (
        <ul className="space-y-1">
          {gekozen.map(a => {
            const naam = naamVan.get(a.user_id) ?? 'Onbekende medewerker'
            return (
              <li
                key={a.user_id}
                className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white py-1 pl-2 pr-1"
              >
                <Avatar name={naam} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">
                  {naam}{jij(a.user_id)}
                </span>
                <select
                  value={a.rol}
                  onChange={e => onRol(a.user_id, e.target.value as AssigneeKeuze['rol'])}
                  aria-label={`Rol van ${naam}`}
                  className="h-7 rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-700 outline-none focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100"
                >
                  {ASSIGNEE_ROLLEN.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onToggle(a.user_id)}
                  aria-label={`${naam} weghalen`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-error-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* `modal`: zie Combobox — anders doet het scrollwiel niets in de lijst. */}
      <Popover open={open} onOpenChange={wisselOpen} modal>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-400 outline-none transition-[border-color,box-shadow] [transition-duration:120ms]',
              'hover:border-neutral-400 focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100 data-[state=open]:border-brand-500 data-[state=open]:ring-[3px] data-[state=open]:ring-brand-100',
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="truncate">
              {gekozen.length ? 'Nog iemand toevoegen…' : 'Zoek een medewerker…'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false} loop label="Medewerkers">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <Command.Input
                value={zoekterm}
                onValueChange={setZoekterm}
                placeholder="Zoek op voor- of achternaam…"
                className="h-10 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </div>
            <Command.List className="max-h-64 overflow-y-auto p-1">
              {resultaten.length === 0 && nietToewijsbaar.length === 0 && (
                <div className="px-3 py-6 text-center text-[13px] text-neutral-500">
                  {zoekterm.trim()
                    ? `Niemand gevonden met „${zoekterm.trim()}”.`
                    : 'Geen medewerkers beschikbaar.'}
                </div>
              )}
              {resultaten.map(m => {
                const id = m.auth_user_id!
                const aan = isGekozen(id)
                return (
                  <Command.Item
                    key={id}
                    value={id}
                    onSelect={() => onToggle(id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors data-[selected=true]:bg-neutral-50"
                  >
                    {/* Ziet eruit als de EVA-checkbox; de hele rij is de knop. */}
                    <span
                      aria-hidden
                      className={cn(
                        'grid h-4 w-4 shrink-0 place-items-center rounded border-[1.5px]',
                        aan ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-300 bg-white',
                      )}
                    >
                      {aan && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">
                      {m.naam}{jij(id)}
                    </span>
                  </Command.Item>
                )
              })}
              {nietToewijsbaar.map(m => (
                <Command.Item
                  key={m.id}
                  value={`geen-account-${m.id}`}
                  disabled
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2"
                >
                  <span aria-hidden className="h-4 w-4 shrink-0 rounded border-[1.5px] border-neutral-200 bg-neutral-100" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-400">{m.naam}</span>
                  <span className="shrink-0 text-[11px] text-neutral-400">Geen EVA-account</span>
                </Command.Item>
              ))}
            </Command.List>
            <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2">
              <span className="text-xs text-neutral-500">
                {gekozen.length === 0 ? 'Nog niemand gekozen' : `${gekozen.length} gekozen`}
              </span>
              <Button type="button" size="sm" onClick={() => wisselOpen(false)}>Klaar</Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
