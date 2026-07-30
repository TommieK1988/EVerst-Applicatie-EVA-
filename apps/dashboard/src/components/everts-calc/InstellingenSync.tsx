'use client'

import { useEffect } from 'react'
import { hydrateInstellingen, setInstellingenPersister } from '@/lib/everts-calc/local-store'
import { getCalcInstellingen, saveCalcInstellingen } from '@/app/(platform)/everts-calc/actions/calc-instellingen'

/**
 * Laadt de globale calculatie-instellingen uit Supabase bij het openen van EvertsCalc
 * en registreert de opslag-callback. Rendert niets. Zorgt dat getInstellingen()
 * synchroon uit de cache kan blijven lezen terwijl Supabase de bron van waarheid is.
 */
export default function InstellingenSync() {
  useEffect(() => {
    setInstellingenPersister(saveCalcInstellingen)
    let actief = true
    getCalcInstellingen()
      .then(data => { if (actief) hydrateInstellingen(data) })
      .catch(() => { /* offline: de standaardlijst blijft staan tot een volgende poging */ })
    return () => { actief = false }
  }, [])

  return null
}
