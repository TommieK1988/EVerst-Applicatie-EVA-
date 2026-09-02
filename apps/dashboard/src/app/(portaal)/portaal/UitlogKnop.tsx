'use client'

import { useTransition } from 'react'
import { portaalUitloggen } from './uitloggen/actions'

/** Uitloggen. `subtiel` voor de variant in de kop, waar hij niet mag schreeuwen. */
export function UitlogKnop({ label = 'Uitloggen', subtiel = false }: { label?: string; subtiel?: boolean }) {
  const [bezig, start] = useTransition()

  return (
    <button
      type="button"
      disabled={bezig}
      onClick={() => start(() => { void portaalUitloggen() })}
      className={
        subtiel
          ? 'text-xs font-semibold text-neutral-500 hover:text-neutral-800 disabled:opacity-50'
          : 'rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60'
      }
    >
      {bezig ? 'Bezig…' : label}
    </button>
  )
}
