'use client'

import { useEffect, useState } from 'react'
import { getWerkbegrotingWijzigingen } from '@/lib/everts-calc/local-store'
import type { WerkbegrotingWijziging } from '@/lib/everts-calc/types'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  regelId: string
  onSluit: () => void
}

const VELD_LABELS: Record<string, string> = {
  tarief: 'Tarief',
  norm_hoeveelheid: 'Norm hoeveelheid',
  type: 'Type',
  relatie_id: 'Relatie',
  leverancier_naam: 'Leverancier',
  aannemersnaam: 'Onderaannemer',
  offertenummer: 'Offertenummer',
  omschrijving: 'Omschrijving',
  opslag_pct: 'Opslag %',
}

function formatWaarde(veld: string, waarde: string | null): string {
  if (waarde === null || waarde === 'undefined') return '—'
  if (veld === 'tarief' || veld === 'norm_hoeveelheid' || veld === 'opslag_pct') {
    const num = parseFloat(waarde)
    return isNaN(num) ? waarde : num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return waarde
}

export default function WijzigingenSidebar({ regelId, onSluit }: Props) {
  const [wijzigingen, setWijzigingen] = useState<WerkbegrotingWijziging[]>([])

  useEffect(() => {
    setWijzigingen(
      getWerkbegrotingWijzigingen(regelId)
        .sort((a, b) => new Date(b.aangemaakt_op).getTime() - new Date(a.aangemaakt_op).getTime())
    )
  }, [regelId])

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onSluit() }}>
      <DrawerContent width={288}>
        <DrawerHeader>
          <DrawerTitle>Wijzigingshistorie</DrawerTitle>
        </DrawerHeader>

        <DrawerBody className="py-2 px-0">
          {wijzigingen.length === 0 ? (
            <EmptyState
              size="sm"
              tone="neutral"
              title="Geen wijzigingen"
              description="Er zijn nog geen wijzigingen geregistreerd voor deze regel."
            />
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-100" />
              {wijzigingen.map((w) => (
                <div key={w.id} className="relative pl-10 pr-4 py-2">
                  <div className="absolute top-3 w-3 h-3 rounded-full border-2 border-white bg-everts shadow-sm" style={{ left: '19px' }} />
                  <p className="text-[10px] text-slate-400">
                    {new Date(w.aangemaakt_op).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    {VELD_LABELS[w.veld] ?? w.veld}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 line-through">{formatWaarde(w.veld, w.oude_waarde)}</span>
                    <span className="text-xs text-slate-300">→</span>
                    <span className="text-xs text-slate-700 font-medium">{formatWaarde(w.veld, w.nieuwe_waarde)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
