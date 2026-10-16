'use client'

import { createContext, useContext } from 'react'
import type { RegelUitvraagStatus } from '@/lib/dossiers/uitvraag-pakket-types'
import { cn } from '@/lib/everts-calc/utils'

/**
 * Uitvragen in het rekenblad: de labels achter de omschrijving en de knop in de
 * selectiebalk. Zonder provider (calculatie buiten een dossier) is alles uit; zo hoeven het
 * rekenblad en de regelrij niets van dossiers te weten.
 */
export interface UitvraagInGrid {
  actief: boolean
  /** Nieuwe uitvraag vanuit de selectie: niet bij een bevroren of alleen-lezen calculatie. */
  kanUitvragen: boolean
  statussen: Map<string, RegelUitvraagStatus>
  onUitvragen: (regelIds: string[]) => void
  onOpenPaneel: (pakketId?: string) => void
}

const Ctx = createContext<UitvraagInGrid>({
  actief: false, kanUitvragen: false, statussen: new Map(), onUitvragen: () => {}, onOpenPaneel: () => {},
})

export const UitvraagProvider = Ctx.Provider
export const useUitvraagInGrid = () => useContext(Ctx)

/** "Uitgevraagd · 2" of "Rekent met Voegbedrijf A" achter de omschrijving. Klik opent het paneel. */
export function UitvraagLabel({ regelId }: { regelId: string }) {
  const { actief, statussen, onOpenPaneel } = useUitvraagInGrid()
  const status = actief ? statussen.get(regelId) : undefined
  if (!status) return null
  const rekent = !!status.rekentMet
  const tekst = rekent ? `Rekent met ${status.rekentMet}` : `Uitgevraagd · ${status.uitgevraagd}`
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpenPaneel(status.pakketId) }}
      title={`${tekst}. Klik om de uitvraag te openen.`}
      className={cn(
        'inline-flex h-[18px] max-w-[160px] flex-shrink-0 items-center rounded-full border px-1.5 text-[10px] font-semibold not-italic transition-colors',
        rekent
          ? 'border-calc-oa bg-calc-oa text-white hover:opacity-90'
          : 'border-calc-oa/30 bg-calc-oa/5 text-calc-oa hover:border-calc-oa/60',
      )}
    >
      <span className="truncate">{tekst}</span>
    </button>
  )
}

/** Knop in de selectiebalk. Alleen binnen een dossier en bij een bewerkbare calculatie. */
export function UitvraagSelectieKnop({ regelIds }: { regelIds: Iterable<string> }) {
  const { actief, kanUitvragen, onUitvragen } = useUitvraagInGrid()
  if (!actief || !kanUitvragen) return null
  return (
    <button
      type="button"
      onClick={() => onUitvragen(Array.from(regelIds))}
      title="Omschrijving en hoeveelheden van de geselecteerde posten uitvragen bij een of meer onderaannemers"
      className="inline-flex h-7 items-center rounded-md border border-calc-oa bg-calc-oa px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
    >
      Uitvragen bij onderaannemer
    </button>
  )
}
