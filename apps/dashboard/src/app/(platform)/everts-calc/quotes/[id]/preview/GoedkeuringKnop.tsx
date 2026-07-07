'use client'

import { useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import GoedkeuringPaneel from '@/components/goedkeuring/GoedkeuringPaneel'
import type { GoedkeuringObjectType } from '@/lib/goedkeuring/types'

interface Props {
  quoteId: string
  dossierId: string | null
  totaalBedrag: number
  /** Aangeroepen als het goedkeuring-venster sluit (om afhankelijke status te herladen). */
  onDone?: () => void
}

export default function GoedkeuringKnop({ quoteId, dossierId, totaalBedrag, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const objectType: GoedkeuringObjectType = 'offerte'

  function sluit() {
    setOpen(false)
    onDone?.()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50 rounded-lg text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
        title="Controller-goedkeuring aanvragen of beoordelen"
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        Goedkeuring
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) sluit() }}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-700" />
                <h2 className="text-base font-bold text-gray-900">Goedkeuring offerte</h2>
              </div>
              <button onClick={sluit} className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
              <GoedkeuringPaneel objectType={objectType} objectId={quoteId} dossierId={dossierId} totaalBedrag={totaalBedrag} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
