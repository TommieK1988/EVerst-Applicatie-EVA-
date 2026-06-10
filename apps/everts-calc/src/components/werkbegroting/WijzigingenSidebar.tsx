'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getWerkbegrotingWijzigingen } from '@/lib/local-store'
import type { WerkbegrotingWijziging } from '@/lib/types'

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
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-slate-200 shadow-xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Wijzigingshistorie</h3>
        <button onClick={onSluit} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {wijzigingen.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">Geen wijzigingen geregistreerd</p>
        ) : (
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-100" />
            {wijzigingen.map((w, i) => (
              <div key={w.id} className="relative pl-10 pr-4 py-2">
                <div className="absolute left-4.5 top-3 w-3 h-3 rounded-full border-2 border-white bg-everts shadow-sm" style={{ left: '19px' }} />
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
      </div>
    </div>
  )
}
