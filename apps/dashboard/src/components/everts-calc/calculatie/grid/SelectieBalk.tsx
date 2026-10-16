'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/everts-calc/utils'
import { UitvraagSelectieKnop } from '../uitvraag/UitvraagContext'

/**
 * Balk boven het rekenblad zodra er regels zijn aangevinkt: alles wat je met een
 * selectie kunt, op één plek, met de sneltoets ernaast.
 */
export function SelectieBalk({ aantal, regelIds = [], onKopieren, onVerplaatsen, onOpslag, onBtw, onVerwijderen, onOpheffen }: {
  aantal: number
  /** De aangevinkte regels; voor "Uitvragen bij onderaannemer" (alleen binnen een dossier). */
  regelIds?: Iterable<string>
  onKopieren: () => void
  onVerplaatsen: () => void
  onOpslag: () => void
  onBtw: () => void
  onVerwijderen: () => void
  onOpheffen: () => void
}) {
  return (
    <div className="mx-3 mt-2 flex flex-shrink-0 flex-wrap items-center gap-2 rounded-[10px] border border-info-300/50 bg-info-50 px-3 py-2">
      <span className="mr-1 text-xs font-semibold text-info-700">
        {aantal} regel{aantal !== 1 ? 's' : ''} geselecteerd
      </span>
      <UitvraagSelectieKnop regelIds={regelIds} />
      <Knop onClick={onKopieren} sneltoets="Ctrl D" title="Kopie van de geselecteerde regels onder de laatste">Dupliceren</Knop>
      <Knop onClick={onVerplaatsen} sneltoets="Ctrl M" title="Naar een andere groep verplaatsen">Verplaatsen</Knop>
      <Knop onClick={onOpslag} title="Opslag% van de geselecteerde regels wijzigen">Opslag%</Knop>
      <Knop onClick={onBtw} title="Btw-tarief van de geselecteerde regels wijzigen">BTW</Knop>
      <Knop onClick={onVerwijderen} sneltoets="Delete" gevaarlijk title="Geselecteerde regels verwijderen">Verwijderen</Knop>
      <button
        type="button"
        onClick={onOpheffen}
        className="ml-auto inline-flex items-center gap-1.5 text-xs text-info-700 hover:underline"
      >
        Selectie opheffen <span className="text-[10.5px] text-info-700/60">Esc</span>
      </button>
    </div>
  )
}

function Knop({ children, onClick, sneltoets, gevaarlijk, title }: {
  children: ReactNode
  onClick: () => void
  sneltoets?: string
  gevaarlijk?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-medium transition-colors',
        gevaarlijk
          ? 'border-error-300/60 text-error-700 hover:bg-error-50'
          : 'border-info-300/50 text-info-700 hover:bg-info-50',
      )}
    >
      {children}
      {sneltoets && <span className="text-[10.5px] opacity-60">{sneltoets}</span>}
    </button>
  )
}
