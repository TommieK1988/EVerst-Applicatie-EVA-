'use client'

/**
 * De offertekaart van Te doen als lade, voor het Bord en de Lijst. Eén hook, zodat elke plek
 * waar je een offerte ziet dezelfde kaart opent (zelfde velden, woorden en uitkomstformulier).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { DossierRij } from '@/components/dossiers/types'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { getMedewerkers } from '@/lib/dossiers/actions'
import { getBedragklassegrenzen } from '@/lib/commercie/bedragklassen-actions'
import type { Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { maakTeDoenRij } from './te-doen'
import { OfferteZijpaneel } from './OfferteZijpaneel'

export function useOfferteLade(dossiers: DossierRij[], mijnMedewerkerId: string | null, aan: boolean) {
  const router = useRouter()
  const vandaag = React.useMemo(() => vandaagNL(), [])
  const [geopendId, setGeopendId] = React.useState<string | null>(null)
  const [medewerkers, setMedewerkers] = React.useState<{ id: string; naam: string }[]>([])
  const [grenzen, setGrenzen] = React.useState<Bedragklassegrenzen | undefined>()

  React.useEffect(() => {
    if (aan) getBedragklassegrenzen().then(setGrenzen).catch(() => {})
  }, [aan])
  React.useEffect(() => {
    if (geopendId && medewerkers.length === 0) getMedewerkers().then(setMedewerkers).catch(() => {})
  }, [geopendId, medewerkers.length])

  const alleRijen = React.useMemo(
    () => (aan ? dossiers.map(d => maakTeDoenRij(d, vandaag, grenzen)) : []),
    [aan, dossiers, vandaag, grenzen],
  )
  const geopend = dossiers.find(d => d.id === geopendId) ?? null
  const open = React.useCallback((id: string) => setGeopendId(id), [])

  const lade = aan ? (
    <OfferteZijpaneel
      dossier={geopend}
      mijnMedewerkerId={mijnMedewerkerId}
      medewerkers={medewerkers}
      vandaag={vandaag}
      onSluit={() => setGeopendId(null)}
      onVastgelegd={() => { setGeopendId(null); router.refresh() }}
      alleRijen={alleRijen}
      onOpen={setGeopendId}
      grenzen={grenzen}
      altijdLade
    />
  ) : null

  return { open, lade, grenzen, vandaag }
}
