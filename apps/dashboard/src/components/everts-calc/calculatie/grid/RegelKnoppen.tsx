'use client'

import { cn } from '@/lib/everts-calc/utils'

/**
 * De vaste knoppen van een regel: normen, werkomschrijving en markering. Ook
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

/**
 * Het markeerbolletje (⚑). Markeren en de interne opmerking horen bij elkaar: je
 * markeert iets óm er iets van te zeggen. Vol oranje = gemarkeerd, oranje ring met
 * stip = alleen een opmerking, grijze ring = niets.
 */
export function MarkeerKnop({ gemarkeerd, opmerking, open, onKlik }: {
  gemarkeerd: boolean
  opmerking?: string
  open: boolean
  onKlik?: () => void
}) {
  const titel = opmerking
    ? `Opmerking: ${opmerking}`
    : gemarkeerd ? 'Gemarkeerd — klik voor de interne opmerking' : 'Markeren en interne opmerking toevoegen'
  return (
    <button
      type="button"
      disabled={!onKlik}
      onClick={e => { e.stopPropagation(); onKlik?.() }}
      title={`${titel} (Ctrl+Alt+Enter)`}
      aria-label={gemarkeerd ? 'Gemarkeerd, interne opmerking' : 'Markeren'}
      aria-expanded={open}
      className={cn(
        'mx-auto flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors',
        gemarkeerd
          ? 'border-orange-500 bg-orange-400'
          : opmerking
            ? 'border-orange-400 bg-white'
            : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50',
        open && 'ring-2 ring-orange-200',
      )}
    >
      {opmerking && <span className={cn('h-1.5 w-1.5 rounded-full', gemarkeerd ? 'bg-white' : 'bg-orange-400')} />}
    </button>
  )
}

/** Eerste regel van de werkomschrijving, grijs onder de regelnaam (ook als hij dicht is). */
export function eersteRegel(tekst: string | undefined | null): string {
  if (!tekst) return ''
  const regel = tekst.split('\n').map(r => r.replace(/^\s*[•\-*]\s*/, '').trim()).find(r => r) ?? ''
  return regel
}
