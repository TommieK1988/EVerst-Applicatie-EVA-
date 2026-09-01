'use client'

import type { ReactNode } from 'react'
import type { View } from './usePlanningLayout'
import { navigatePeriode, periodeLabel } from './usePlanningLayout'
import { Button } from '@/components/ui/button'

const VIEW_LABELS: Record<View, string> = {
  dag:     'Dag',
  week:    'Week',
  '2weken': '2 weken',
  maand:   'Maand',
  kwartaal:'Kwartaal',
  jaar:    'Jaar',
}

// Standaard zonder 'Dag' (alleen de detailplanning gebruikt uur-detail).
const VIEWS: View[] = ['week', '2weken', 'maand', 'kwartaal', 'jaar']

export default function PeriodeNav({
  peildatum, view, views = VIEWS,
  onPeildatum, onView, onVandaag, rightSlot,
}: {
  peildatum:    Date
  view:         View
  /** Optionele subset; default: alle 5 modes. */
  views?:       View[]
  onPeildatum:  (d: Date) => void
  onView:       (v: View) => void
  /** Override-handler voor de Vandaag-knop (default: onPeildatum(new Date())). */
  onVandaag?:   () => void
  rightSlot?:   ReactNode
}) {
  const vorige   = () => onPeildatum(navigatePeriode(view, peildatum, -1))
  const volgende = () => onPeildatum(navigatePeriode(view, peildatum, +1))
  const vandaag  = onVandaag ?? (() => onPeildatum(new Date()))

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <Button variant="ghost" size="sm" onClick={vorige}>‹</Button>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
        minWidth: 240, textAlign: 'center',
      }}>
        {periodeLabel(view, peildatum)}
      </span>
      <Button variant="ghost" size="sm" onClick={volgende}>›</Button>
      <Button variant="ghost" size="sm" onClick={vandaag}>Vandaag</Button>

      <div className="flex gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-md p-0.5">
        {views.map(v => (
          <Button
            key={v}
            variant={view === v ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onView(v)}
            className=" text-[10px] font-bold"
          >
            {VIEW_LABELS[v]}
          </Button>
        ))}
      </div>

      {rightSlot && <div className="ml-auto flex flex-wrap items-center gap-2">{rightSlot}</div>}
    </div>
  )
}
