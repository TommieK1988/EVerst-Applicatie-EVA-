'use client'

import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/everts-calc/utils'

/**
 * De twee vaste knoppen naast de omschrijving: normen en werkomschrijving. Ook
 * zichtbaar als ze nog leeg zijn (gestippeld), zodat je ziet dát het kan.
 */
export function NormenKnop({ aantal, open, onWissel }: {
  aantal: number
  open: boolean
  onWissel: () => void
}) {
  if (aantal === 0 && !open) {
    return (
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onWissel() }}
        title="Norm toevoegen (Ctrl+Enter)"
        aria-label="Norm toevoegen"
        className="inline-flex h-5 min-w-[26px] items-center justify-center rounded-md border border-dashed border-neutral-300 px-1 text-[11px] font-semibold text-neutral-400 hover:border-brand-500 hover:text-brand-700"
      >
        +
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onWissel() }}
      title={`${open ? 'Normen verbergen' : 'Normen tonen'} (Ctrl+Enter)`}
      aria-expanded={open}
      className={cn(
        'inline-flex h-5 min-w-[30px] items-center justify-center gap-0.5 rounded-md border px-1 text-[10.5px] font-semibold tabular-nums transition-colors',
        open
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-brand-500/40 bg-brand-50 text-brand-700 hover:border-brand-500',
      )}
    >
      {aantal}
      <span className="text-[9px]">{open ? '▾' : '▸'}</span>
    </button>
  )
}

export function OmschrijvingKnop({ gevuld, open, onWissel }: {
  gevuld: boolean
  open: boolean
  onWissel: () => void
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onWissel() }}
      title={`${open ? 'Werkomschrijving verbergen' : gevuld ? 'Werkomschrijving tonen' : 'Werkomschrijving toevoegen'} (Ctrl+Shift+Enter)`}
      aria-expanded={open}
      className={cn(
        'inline-flex h-5 min-w-[26px] items-center justify-center rounded-md px-1 text-[11px] font-semibold transition-colors',
        open
          ? 'border border-brand-500 bg-brand-500 text-white'
          : gevuld
            ? 'border border-brand-500/40 bg-brand-50 text-brand-700 hover:border-brand-500'
            : 'border border-dashed border-neutral-300 text-neutral-400 hover:border-brand-500 hover:text-brand-700',
      )}
    >
      ¶
    </button>
  )
}

/** Interne opmerking: oranje als er een is, "+" als je er een kunt toevoegen. */
export function OpmerkingKnop({ gevuld, open, tekst, onWissel }: {
  gevuld: boolean
  open: boolean
  tekst?: string
  onWissel: () => void
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onWissel() }}
      title={`${gevuld ? `Opmerking: ${tekst}` : 'Interne opmerking toevoegen'} (Ctrl+Alt+Enter)`}
      aria-expanded={open}
      aria-label={gevuld ? 'Interne opmerking' : 'Interne opmerking toevoegen'}
      className={cn(
        'inline-flex h-5 min-w-[26px] items-center justify-center rounded-md px-1 transition-colors',
        open
          ? 'border border-warning-500 bg-warning-500 text-white'
          : gevuld
            ? 'border border-warning-300 bg-warning-100 text-warning-700 hover:border-warning-500'
            : 'border border-dashed border-neutral-300 text-neutral-400 hover:border-warning-500 hover:text-warning-700',
      )}
    >
      {gevuld || open
        ? <MessageSquare className="h-3 w-3" />
        : <span className="text-[11px] font-semibold">+</span>}
    </button>
  )
}

/** Eerste regel van de werkomschrijving, grijs onder de regelnaam (ook als hij dicht is). */
export function eersteRegel(tekst: string | undefined | null): string {
  if (!tekst) return ''
  const regel = tekst.split('\n').map(r => r.replace(/^\s*[•\-*]\s*/, '').trim()).find(r => r) ?? ''
  return regel
}
