'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ControleLijst from './ControleLijst'
import type { ControlePunt, ControleSoort } from '@/lib/everts-calc/controle'

interface Props {
  open: boolean
  onSluit: () => void
  punten: ControlePunt[]
  tellers: { rood: number; oranje: number }
  readOnly?: boolean
  onNaarRegel: (regelId: string) => void
  onKlopt: (sleutel: string) => void
  acties?: Partial<Record<ControleSoort, { label: string; onClick: () => void }>>
}

/**
 * Controlepaneel rechts naast het grid. Opent alleen op klik (knop Controle) of
 * wanneer je vanuit het offertevenster naar een regel springt; staat er verder niet
 * in de weg. Verborgen, niet ontkoppeld: de lijst houdt zo zijn uitgeklapte groepen.
 */
export default function ControlePaneel({ open, onSluit, punten, tellers, readOnly, onNaarRegel, onKlopt, acties }: Props) {
  return (
    <aside className={`${open ? 'flex' : 'hidden'} w-80 xl:w-96 flex-shrink-0 flex-col bg-white border-l border-neutral-200`}>
      <div className="flex items-center border-b border-neutral-200 h-9 flex-shrink-0 pl-3">
        <span className="text-xs text-neutral-600 font-semibold flex-1">Controle</span>
        <span className="text-[11px] text-neutral-500 mr-2">
          {tellers.rood > 0 && <span className="text-error-700 font-semibold">{tellers.rood} op te lossen</span>}
          {tellers.rood > 0 && tellers.oranje > 0 && ' · '}
          {tellers.oranje > 0 && <span className="text-warning-700 font-semibold">{tellers.oranje} nakijken</span>}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onSluit} className="mr-1 text-neutral-400" title="Sluiten">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <ControleLijst punten={punten} readOnly={readOnly} onNaarRegel={onNaarRegel} onKlopt={onKlopt} acties={acties} />
      </div>
      <p className="flex-shrink-0 border-t border-neutral-100 px-3 py-2 text-[11px] text-neutral-500 leading-snug">
        Rood houdt de offerte tegen. Oranje is ter controle; &quot;Klopt&quot; wordt per versie bewaard.
      </p>
    </aside>
  )
}
