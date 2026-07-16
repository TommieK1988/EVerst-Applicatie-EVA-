'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import GoedkeuringPaneel from '@/components/goedkeuring/GoedkeuringPaneel'
import type { GoedkeuringObjectType } from '@/lib/goedkeuring/types'
import {
  getOfferteGoedkeuringKnopStatus,
  type OfferteGoedkeuringKnopStatus,
} from '@/app/(platform)/everts-calc/actions/offerte-verzenden'

interface Props {
  quoteId: string
  dossierId: string | null
  totaalBedrag: number
  /** Aangeroepen als het goedkeuring-venster sluit (om afhankelijke status te herladen). */
  onDone?: () => void
}

/**
 * Status-bewuste goedkeuringsknop voor de offerte — spiegelt de werkbegroting-header:
 * groen "Offerte goedkeuren" als er een open aanvraag is die je mag accorderen,
 * anders een statusgekleurde knop die vertelt waar het proces staat.
 */
export default function GoedkeuringKnop({ quoteId, dossierId, totaalBedrag, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<OfferteGoedkeuringKnopStatus | null>(null)
  const objectType: GoedkeuringObjectType = 'offerte'

  const herlaad = useCallback(async () => {
    try {
      setStatus(await getOfferteGoedkeuringKnopStatus(quoteId))
    } catch {
      /* stil — knop valt terug op de neutrale variant */
    }
  }, [quoteId])

  useEffect(() => { herlaad() }, [herlaad])

  function sluit() {
    setOpen(false)
    void herlaad()
    onDone?.()
  }

  const magGoedkeuren = status?.status === 'aangevraagd' && status.magBeoordelen
  const gewijzigdNaGoedkeuring = status?.status === 'goedgekeurd' && !status.ongewijzigd

  /** Label + kleur van de statusvariant (dezelfde semantiek als de werkbegroting). */
  function knopWeergave(): { label: string; cls: string; title: string } {
    if (status?.status === 'goedgekeurd' && status.ongewijzigd) {
      return {
        label: 'Goedgekeurd',
        cls: 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
        title: 'Deze offerte is goedgekeurd — geen wijzigingen sinds de goedkeuring',
      }
    }
    if (gewijzigdNaGoedkeuring) {
      return {
        label: 'Gewijzigd',
        cls: 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
        title: 'De offerte is gewijzigd na de goedkeuring — opnieuw ter goedkeuring indienen',
      }
    }
    if (status?.status === 'aangevraagd') {
      return {
        label: 'Ter beoordeling',
        cls: 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
        title: 'Wacht op beoordeling door de controller',
      }
    }
    if (status?.status === 'afgekeurd') {
      return {
        label: 'Teruggestuurd',
        cls: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        title: 'Teruggestuurd door de beoordelaar — bekijk de opmerking',
      }
    }
    if (status && !status.vereist) {
      return {
        label: 'Goedkeuring (niet vereist)',
        cls: 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
        title: 'Voor deze offerte is geen goedkeuring vereist — je kunt hem wel vrijwillig laten beoordelen',
      }
    }
    return {
      label: 'Goedkeuring',
      cls: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      title: 'Controller-goedkeuring aanvragen of beoordelen',
    }
  }

  const weergave = knopWeergave()

  return (
    <>
      {magGoedkeuren ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-green-600 text-white border border-green-600 hover:bg-green-700 shadow-sm"
          title="Deze offerte goedkeuren"
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Offerte goedkeuren
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${weergave.cls}`}
          title={weergave.title}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          {weergave.label}
        </button>
      )}

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
              <GoedkeuringPaneel
                objectType={objectType}
                objectId={quoteId}
                dossierId={dossierId}
                totaalBedrag={totaalBedrag}
                wijzigingsInfo={status ? { ongewijzigdSindsGoedkeuring: status.ongewijzigd } : undefined}
                onVeranderd={herlaad}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
