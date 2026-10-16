'use client'

/**
 * Filter op bedrag in "Te doen": de vier klassen aan of uit, en desgewenst een eigen van–tot.
 *
 * Standaard staat klein uit: die worden niet nagebeld. Loopt de planning leeg, dan zet je middel
 * en klein erbij, of kies je een eigen bandbreedte ("alles tussen 10k en 40k").
 */

import * as React from 'react'
import { cn } from '@everts/ui'
import { BEDRAGKLASSEN, type Bedragklasse } from '@/lib/commercie/bedragklassen'

type Props = {
  klassen: Record<Bedragklasse, boolean>
  onKlassen: (k: Record<Bedragklasse, boolean>) => void
  /** Aantal open offertes per klasse, binnen "van mij/iedereen". */
  aantallen: Record<Bedragklasse, number>
  min: number | null
  max: number | null
  onBereik: (min: number | null, max: number | null) => void
  /** Rechts in de balk, bv. de knop voor offertes op "niet nabellen". */
  extra?: React.ReactNode
}

const leesBedrag = (v: string): number | null => {
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

export function BedragFilter(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-neutral-200 bg-white px-3 py-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Bedrag</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Bedragklassen">
        {BEDRAGKLASSEN.map(k => {
          const aan = props.klassen[k.klasse]
          return (
            <button
              key={k.klasse}
              type="button"
              aria-pressed={aan}
              onClick={() => props.onKlassen({ ...props.klassen, [k.klasse]: !aan })}
              className={cn(
                'inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                aan
                  ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                  : 'border-neutral-300 bg-white font-medium text-neutral-600 hover:bg-neutral-50',
              )}
            >
              {k.label}
              <span className={cn('text-[11px] font-normal', aan ? 'text-brand-700' : 'text-neutral-400')}>
                {k.uitleg} · {props.aantallen[k.klasse]}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1 text-xs text-neutral-500">
        <label htmlFor="bedrag-van">van €</label>
        <input
          id="bedrag-van"
          inputMode="numeric"
          placeholder="0"
          value={props.min ?? ''}
          onChange={e => props.onBereik(leesBedrag(e.target.value), props.max)}
          className="h-7 w-24 rounded-md border border-neutral-300 bg-white px-2 text-xs tabular-nums text-neutral-900 focus:border-brand-500 focus:outline-none"
        />
        <label htmlFor="bedrag-tot">tot €</label>
        <input
          id="bedrag-tot"
          inputMode="numeric"
          placeholder="geen max"
          value={props.max ?? ''}
          onChange={e => props.onBereik(props.min, leesBedrag(e.target.value))}
          className="h-7 w-24 rounded-md border border-neutral-300 bg-white px-2 text-xs tabular-nums text-neutral-900 focus:border-brand-500 focus:outline-none"
        />
        {(props.min != null || props.max != null) && (
          <button type="button" onClick={() => props.onBereik(null, null)} className="ml-1 font-semibold text-brand-700 underline underline-offset-2">
            wissen
          </button>
        )}
      </div>
      {props.extra && <div className="ml-auto">{props.extra}</div>}
    </div>
  )
}
