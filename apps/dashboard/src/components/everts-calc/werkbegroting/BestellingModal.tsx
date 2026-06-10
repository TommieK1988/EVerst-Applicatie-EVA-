'use client'

import { useState } from 'react'
import { X, Package } from 'lucide-react'
import { nieuweId } from '@/lib/everts-calc/utils'
import { slaBestellingOp } from '@/lib/everts-calc/local-store'
import type { WerkbegrotingComponent, WerkbegrotingBestelling } from '@/lib/everts-calc/types'
import RelatieZoekveld from './RelatieZoekveld'
import { formatEuro } from '@/lib/everts-calc/calculations'

interface Props {
  werkbegrotingId: string
  componenten: WerkbegrotingComponent[]
  onSluit: () => void
  onAangemaakt: () => void
}

export default function BestellingModal({ werkbegrotingId, componenten, onSluit, onAangemaakt }: Props) {
  const [omschrijving, setOmschrijving] = useState('')
  const [relatieId, setRelatieId] = useState<string | undefined>()
  const [relatieNaam, setRelatieNaam] = useState<string | undefined>()

  const totaalBedrag = componenten.reduce((s, c) => s + c.norm_hoeveelheid * c.tarief, 0)

  const handleAanmaken = () => {
    if (!omschrijving.trim()) return
    const bestelling: WerkbegrotingBestelling = {
      id: nieuweId(),
      werkbegroting_id: werkbegrotingId,
      omschrijving: omschrijving.trim(),
      relatie_id: relatieId,
      status: 'concept',
      component_ids: componenten.map(c => c.id),
    }
    slaBestellingOp(bestelling)
    onAangemaakt()
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-everts" />
            <h2 className="font-semibold text-slate-800">Bestelling aanmaken</h2>
          </div>
          <button onClick={onSluit} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-slate-50 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500 font-medium">Geselecteerde componenten</p>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {componenten.map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 truncate flex-1 mr-2">
                    {c.omschrijving || (c.type === 'arbeid' ? 'Arbeid' : c.type === 'materieel' ? 'Materieel' : 'Onderaanneming')}
                  </span>
                  <span className="font-mono text-slate-500 flex-shrink-0">{formatEuro(c.norm_hoeveelheid * c.tarief)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between">
              <span className="text-xs font-semibold text-slate-600">Totaal (indicatief)</span>
              <span className="text-xs font-mono font-bold text-slate-800">{formatEuro(totaalBedrag)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Bestelling omschrijving *</label>
            <input
              type="text" value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAanmaken()}
              placeholder="bijv. Levering steigermateriaal week 12"
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Leverancier / Onderaannemer</label>
            <div className="border border-slate-200 rounded-lg px-3 py-2">
              {relatieId && relatieNaam ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700 flex-1">{relatieNaam}</span>
                  <button onClick={() => { setRelatieId(undefined); setRelatieNaam(undefined) }} className="text-slate-400 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <RelatieZoekveld
                  type={componenten.some(c => c.type === 'onderaanneming') ? 'onderaannemer' : 'leverancier'}
                  onSelecteer={(id, naam) => { setRelatieId(id); setRelatieNaam(naam) }}
                  onWis={() => { setRelatieId(undefined); setRelatieNaam(undefined) }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button onClick={onSluit} className="text-sm px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors">
            Annuleren
          </button>
          <button
            onClick={handleAanmaken}
            disabled={!omschrijving.trim()}
            className="text-sm px-4 py-2 bg-everts text-white rounded-lg hover:bg-everts/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            Bestelling aanmaken
          </button>
        </div>
      </div>
    </div>
  )
}
