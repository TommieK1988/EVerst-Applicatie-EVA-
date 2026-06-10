'use client'

import { X, Clock } from 'lucide-react'
import type { Meetstaat } from '@/lib/types'
import { getMeetstaten } from '@/lib/local-store'

interface Props {
  scenarioId: string
  onSelecteer: (ms: Meetstaat) => void
  onSluit: () => void
}

export default function MeetstaatOpenenModal({ scenarioId, onSelecteer, onSluit }: Props) {
  const meetstaten = getMeetstaten(scenarioId).sort((a, b) =>
    b.aangepast_op.localeCompare(a.aangepast_op)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">Meetstaat openen</h3>
          <button onClick={onSluit} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {meetstaten.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Geen meetstaten gevonden voor dit scenario
            </p>
          ) : (
            meetstaten.map(ms => (
              <button
                key={ms.id}
                onClick={() => onSelecteer(ms)}
                className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-200
                           hover:border-everts/40 hover:bg-everts/5 transition-colors text-left"
              >
                <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{ms.naam}</span>
                    <span className="text-xs font-mono text-slate-400">{ms.code}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ml-auto ${
                      ms.status === 'gesynchroniseerd'
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : ms.status === 'definitief'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>
                      {ms.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bewerkt: {new Date(ms.aangepast_op).toLocaleDateString('nl-NL', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button onClick={onSluit} className="text-sm text-slate-500 hover:text-slate-700">
            Annuleren
          </button>
        </div>
      </div>
    </div>
  )
}
