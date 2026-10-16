'use client'

import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui'
import type { UitvraagPost } from '@/lib/dossiers/uitvraag-pakket-types'

/**
 * De regels die meegaan in de uitvraag, aan te passen vóór het versturen: omschrijving,
 * hoeveelheid en eenheid, en een regel weghalen. Bij een materiaallijst kun je er ook een
 * toevoegen; normen hebben lang niet altijd een omschrijving of eenheid, en een groothandel
 * moet precies weten wat er bedoeld wordt.
 */
export function UitvraagRegels({ regels, onWijzig, kanToevoegen, disabled }: {
  regels: UitvraagPost[]
  onWijzig: (regels: UitvraagPost[]) => void
  kanToevoegen?: boolean
  disabled?: boolean
}) {
  const zet = (i: number, patch: Partial<UitvraagPost>) =>
    onWijzig(regels.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="rounded-lg border border-neutral-200">
      <ul className="max-h-64 overflow-y-auto">
        {regels.map((r, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-neutral-100 px-2 py-1 last:border-b-0">
            <Input
              value={r.omschrijving} disabled={disabled} aria-label="Omschrijving"
              onChange={e => zet(i, { omschrijving: e.target.value })}
              className="h-8 min-w-0 flex-1 border-transparent text-[13px] hover:border-neutral-200 focus:border-neutral-300"
            />
            <Input
              inputMode="decimal" disabled={disabled} aria-label="Hoeveelheid"
              value={r.hoeveelheid == null ? '' : String(r.hoeveelheid).replace('.', ',')}
              onChange={e => {
                const v = e.target.value.trim().replace(',', '.')
                const n = v === '' ? null : Number(v)
                if (n === null || Number.isFinite(n)) zet(i, { hoeveelheid: n })
              }}
              className="h-8 w-20 flex-shrink-0 border-transparent text-right text-[13px] tabular-nums hover:border-neutral-200 focus:border-neutral-300"
            />
            <Input
              value={r.eenheid ?? ''} disabled={disabled} aria-label="Eenheid" placeholder="eenh."
              onChange={e => zet(i, { eenheid: e.target.value || null })}
              className="h-8 w-16 flex-shrink-0 border-transparent text-[13px] hover:border-neutral-200 focus:border-neutral-300"
            />
            <button
              type="button" disabled={disabled} onClick={() => onWijzig(regels.filter((_, j) => j !== i))}
              className="grid h-6 w-6 flex-shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              title="Niet meesturen" aria-label="Regel weghalen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {regels.length === 0 && (
          <li className="px-3 py-2 text-[13px] text-neutral-500">Geen regels.</li>
        )}
      </ul>
      {kanToevoegen && (
        <button
          type="button" disabled={disabled}
          onClick={() => onWijzig([...regels, { calculatieregel_id: '', omschrijving: '', hoeveelheid: null, eenheid: null }])}
          className="flex w-full items-center gap-1 border-t border-neutral-100 px-3 py-1.5 text-xs font-semibold text-calc-oa hover:bg-calc-oa/5"
        >
          <Plus className="h-3.5 w-3.5" /> Regel
        </button>
      )}
    </div>
  )
}
