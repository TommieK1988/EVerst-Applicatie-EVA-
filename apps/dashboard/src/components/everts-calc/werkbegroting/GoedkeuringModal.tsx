'use client'

import { useState } from 'react'
import { X, CheckCircle, RotateCcw, Send, ChevronRight, Lock } from 'lucide-react'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { Werkbegroting } from '@/lib/everts-calc/types'

interface Props {
  wb: Werkbegroting
  totaalBedrag: number
  onStatusWijzig: (nieuweStatus: 'concept' | 'definitief' | 'geaccordeerd', notitie?: string) => void
  onSluit: () => void
}

const STAPPEN = [
  { key: 'concept', label: 'Concept' },
  { key: 'definitief', label: 'Ter goedkeuring' },
  { key: 'geaccordeerd', label: 'Geaccordeerd' },
] as const

type Status = 'concept' | 'definitief' | 'geaccordeerd'

const STAP_INDEX: Record<Status, number> = {
  concept: 0,
  definitief: 1,
  geaccordeerd: 2,
}

function StatusFlow({ huidigStatus }: { huidigStatus: Status }) {
  const huidigIndex = STAP_INDEX[huidigStatus]

  return (
    <div className="flex items-center gap-1 py-3">
      {STAPPEN.map((stap, idx) => {
        const isActief = idx === huidigIndex
        const isVoltooid = idx < huidigIndex

        return (
          <div key={stap.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
                  isVoltooid
                    ? 'bg-green-500 border-green-500 text-white'
                    : isActief
                    ? 'bg-blue-700 border-blue-700 text-white'
                    : 'bg-white border-gray-300 text-gray-400',
                ].join(' ')}
              >
                {isVoltooid ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={[
                  'text-xs font-medium whitespace-nowrap',
                  isActief ? 'text-blue-700' : isVoltooid ? 'text-green-600' : 'text-gray-400',
                ].join(' ')}
              >
                {stap.label}
              </span>
            </div>

            {idx < STAPPEN.length - 1 && (
              <div
                className={[
                  'w-10 h-0.5 mb-4 rounded',
                  idx < huidigIndex ? 'bg-green-400' : 'bg-gray-200',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function GoedkeuringModal({ wb, totaalBedrag, onStatusWijzig, onSluit }: Props) {
  const [notitie, setNotitie] = useState('')

  const status = wb.status as Status

  const titel = {
    concept: 'Goedkeuring aanvragen',
    definitief: 'Werkbegroting beoordelen',
    geaccordeerd: 'Geaccordeerde werkbegroting',
  }[status]

  const aangemeldOp = new Date(wb.aangemaakt_op).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  function handleAktie(nieuweStatus: Status) {
    onStatusWijzig(nieuweStatus, notitie.trim() || undefined)
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSluit()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-base font-bold text-gray-900">{titel}</h2>
          <button
            onClick={onSluit}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1 hover:bg-gray-200"
            aria-label="Sluiten"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Statusflow */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Voortgang goedkeuringsproces
            </p>
            <StatusFlow huidigStatus={status} />
          </div>

          {/* Info kaarten */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-0.5">Totaalbedrag</p>
              <p className="text-xl font-bold text-blue-900">{formatEuro(totaalBedrag)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Aangemaakt op</p>
              <p className="text-base font-semibold text-gray-700">{aangemeldOp}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{wb.naam}</p>
            </div>
          </div>

          {/* Geaccordeerd: vergrendeld bericht */}
          {status === 'geaccordeerd' && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
              <span>
                Deze werkbegroting is geaccordeerd en vergrendeld. Heropenen zet de status terug naar <strong>Concept</strong>.
              </span>
            </div>
          )}

          {/* Notitie / opmerking */}
          {status !== 'geaccordeerd' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Notitie / opmerking <span className="font-normal text-gray-400">(optioneel)</span>
              </label>
              <textarea
                value={notitie}
                onChange={(e) => setNotitie(e.target.value)}
                rows={3}
                placeholder={
                  status === 'concept'
                    ? 'Voeg een toelichting toe voor de beoordelaar…'
                    : 'Voeg een opmerking toe voor de indiener…'
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Footer / knoppen */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">

          {/* CONCEPT → Ter goedkeuring indienen */}
          {status === 'concept' && (
            <div className="flex justify-end gap-3">
              <button
                onClick={onSluit}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleAktie('definitief')}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
              >
                Ter goedkeuring indienen
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* DEFINITIEF → Terugsturen of Accorderen */}
          {status === 'definitief' && (
            <div className="flex justify-between gap-3">
              <button
                onClick={onSluit}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuleren
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAktie('concept')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Terugsturen naar concept
                </button>
                <button
                  onClick={() => handleAktie('geaccordeerd')}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Accorderen
                </button>
              </div>
            </div>
          )}

          {/* GEACCORDEERD → Sluiten of Heropenen */}
          {status === 'geaccordeerd' && (
            <div className="flex justify-between gap-3">
              <button
                onClick={() => handleAktie('concept')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Heropenen
              </button>
              <button
                onClick={onSluit}
                className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Sluiten
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
