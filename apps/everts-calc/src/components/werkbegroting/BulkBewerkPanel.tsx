'use client'

import { useState } from 'react'
import { X, Package, Percent } from 'lucide-react'
import type { WerkbegrotingComponent } from '@/lib/types'
import RelatieZoekveld from './RelatieZoekveld'

interface Props {
  geselecteerdeComponenten: WerkbegrotingComponent[]
  werkbegrotingId: string
  onWijzig: (patch: Partial<WerkbegrotingComponent>) => void
  onBestelling: () => void
  onWisSelectie: () => void
}

export default function BulkBewerkPanel({ geselecteerdeComponenten, onWijzig, onBestelling, onWisSelectie }: Props) {
  const [tariefPct, setTariefPct] = useState('')
  const aantalOA = geselecteerdeComponenten.filter(c => c.type === 'onderaanneming').length
  const aantalLev = geselecteerdeComponenten.filter(c => c.type !== 'onderaanneming').length

  const handleTariefAanpassing = () => {
    const pct = parseFloat(tariefPct)
    if (isNaN(pct)) return
    const factor = 1 + pct / 100
    geselecteerdeComponenten.forEach(c => {
      onWijzig({ tarief: Math.round(c.tarief * factor * 100) / 100 })
    })
    setTariefPct('')
  }

  return (
    <div className="border-t border-slate-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">
            {geselecteerdeComponenten.length} component{geselecteerdeComponenten.length !== 1 ? 'en' : ''} geselecteerd
          </span>
          <button
            onClick={onWisSelectie}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors"
          >
            <X className="w-3 h-3" /> Wis
          </button>
        </div>

        {/* Leverancier koppelen */}
        {aantalLev > 0 && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <span className="text-xs text-slate-500 whitespace-nowrap">Leverancier:</span>
            <div className="w-44">
              <RelatieZoekveld
                type="leverancier"
                onSelecteer={(id, naam) => onWijzig({ relatie_id: id, leverancier_naam: naam })}
                onWis={() => onWijzig({ relatie_id: undefined, leverancier_naam: undefined })}
              />
            </div>
          </div>
        )}

        {/* Onderaannemer koppelen */}
        {aantalOA > 0 && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <span className="text-xs text-slate-500 whitespace-nowrap">Onderaannemer:</span>
            <div className="w-44">
              <RelatieZoekveld
                type="onderaannemer"
                onSelecteer={(id, naam) => onWijzig({ relatie_id: id, aannemersnaam: naam })}
                onWis={() => onWijzig({ relatie_id: undefined, aannemersnaam: undefined })}
              />
            </div>
          </div>
        )}

        {/* Tarief aanpassen */}
        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
          <Percent className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="number"
            step="0.1"
            placeholder="bijv. -5"
            value={tariefPct}
            onChange={e => setTariefPct(e.target.value)}
            className="w-20 text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-everts/40 text-right font-mono"
          />
          <span className="text-xs text-slate-400">%</span>
          <button
            onClick={handleTariefAanpassing}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-everts hover:text-white text-slate-600 rounded transition-colors"
          >
            Toepassen
          </button>
        </div>

        {/* Bestelling aanmaken */}
        <div className="ml-auto border-l border-slate-200 pl-4">
          <button
            onClick={onBestelling}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-everts text-white rounded-lg hover:bg-everts/90 transition-colors font-semibold"
          >
            <Package className="w-3.5 h-3.5" />
            Maak bestelling
          </button>
        </div>
      </div>
    </div>
  )
}
