'use client'

/**
 * Sortering "Per post" in de werkbegroting, en de koppeling bewakingscode → Hoofdopdracht.
 *
 * Alleen een indeling: de kostengroepen komen in vier blokken (Hoofdopdracht, Stelposten,
 * Meerwerk, Nog niet gekoppeld; op een regiebon ook Regie) met als subtotaal de som van de
 * bestaande kostengroep-totalen. Er rekent niets anders dan in de gewone kostengroep-sortering.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { EigenBewakingscode } from '@/lib/dossiers/werkbegroting-codes'
import { getKoppelingen, koppelAanHoofdopdracht } from '@/lib/dossiers/bewakingscode-koppeling-actions'

export type PostGroep = 'hoofdopdracht' | 'stelpost' | 'meerwerk' | 'regie' | 'los'

export const POST_VOLGORDE: Record<PostGroep, number> = {
  hoofdopdracht: 0, stelpost: 1, meerwerk: 2, regie: 3, los: 4,
}

export const POST_LABEL: Record<PostGroep, string> = {
  hoofdopdracht: 'Hoofdopdracht',
  stelpost: 'Stelposten',
  meerwerk: 'Meerwerk',
  regie: 'Regie',
  los: 'Nog niet gekoppeld',
}

/**
 * In welk blok een kostengroep hoort. Stelposten, meerwerk en regie hebben hun eigen post; elke
 * andere bewakingscode (ook Correcties) staat bij de Hoofdopdracht als hij gekoppeld is, anders
 * bij "Nog niet gekoppeld". Een regel zonder kostengroep is nooit gekoppeld.
 */
export function postVan(
  code: string,
  eigenSoort: EigenBewakingscode['soort'] | undefined,
  gekoppeld: Set<string>,
): PostGroep {
  if (eigenSoort === 'stelpost' || eigenSoort === 'meerwerk' || eigenSoort === 'regie') return eigenSoort
  return code && gekoppeld.has(code) ? 'hoofdopdracht' : 'los'
}

/** Mag deze kostengroep aan de Hoofdopdracht gekoppeld worden? */
export function isKoppelbaar(code: string, eigenSoort: EigenBewakingscode['soort'] | undefined): boolean {
  return !!code && eigenSoort !== 'stelpost' && eigenSoort !== 'meerwerk' && eigenSoort !== 'regie'
}

/** De gekoppelde codes van een dossier, met optimistisch wisselen. */
export function useKoppelingen(dossierId: string | null | undefined) {
  const [gekoppeld, setGekoppeld] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!dossierId) return
    let actief = true
    getKoppelingen(dossierId)
      .then(codes => { if (actief) setGekoppeld(new Set(codes)) })
      .catch(() => { /* zonder koppelingen staat alles onder "Nog niet gekoppeld" */ })
    return () => { actief = false }
  }, [dossierId])

  const wissel = useCallback(async (kostengroep: string, code: string) => {
    if (!dossierId || !code) return
    const aan = !gekoppeld.has(code)
    const zet = (waarde: boolean) => setGekoppeld(prev => {
      const volgende = new Set(prev)
      if (waarde) volgende.add(code); else volgende.delete(code)
      return volgende
    })
    zet(aan)
    try {
      const res = await koppelAanHoofdopdracht(dossierId, kostengroep, aan)
      if (!res.ok) { zet(!aan); toast.error(res.error) }
    } catch {
      zet(!aan)
      toast.error('Koppelen is niet gelukt.')
    }
  }, [dossierId, gekoppeld])

  return { gekoppeld, wissel }
}

/** Schakelaar op de kop van een kostengroep: hoort deze bewakingscode bij de Hoofdopdracht? */
export function KoppelSchakelaar({ aan, onWissel }: { aan: boolean; onWissel: () => void }) {
  return (
    <button
      type="button"
      onClick={onWissel}
      aria-pressed={aan}
      title={aan
        ? 'Gekoppeld aan de Hoofdopdracht — klik om los te koppelen. Verandert geen bedrag.'
        : 'Koppel deze bewakingscode aan de Hoofdopdracht. Verandert geen bedrag, alleen de indeling.'}
      className={[
        'rounded-full border px-2 py-px text-[10px] font-semibold normal-case tracking-normal transition-colors',
        aan
          ? 'border-everts bg-everts text-white hover:bg-everts/90'
          : 'border-slate-300 bg-white text-slate-500 hover:border-everts hover:text-everts',
      ].join(' ')}
    >
      {aan ? '✓ Hoofdopdracht' : '+ Hoofdopdracht'}
    </button>
  )
}
