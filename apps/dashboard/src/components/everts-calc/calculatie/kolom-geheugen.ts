'use client'

import { useEffect, useRef } from 'react'
import { slaLayoutOp } from '@/app/actions/layouts'
import type { KolomConfig } from '@everts/database/platform-types'

/**
 * De laatst gebruikte kolomindeling van het calculatie-rekenblad, per gebruiker.
 *
 * Een benoemde layout bewaar je zelf; maar wie alleen even een kolom verbergt of
 * breder sleept, raakte dat kwijt bij het volgende openen en moest alles opnieuw
 * instellen. Deze ene rij per gebruiker (tabel gebruiker_layouts, eigen scherm-
 * sleutel) houdt de laatste stand bij en wint bij het openen van de standaard-layout.
 * In `naam` staat het id van de layout die toen actief was ('' = geen), zodat
 * "Layout bijwerken" na het heropenen nog op de goede layout werkt.
 */
export const LAATST_SCHERM = 'evc_calculatie_laatst'

const WACHT_MS = 800

export function useBewaarLaatsteKolommen({
  userId, rijId, onRijId, kolommen, actiefLayoutId, klaar,
}: {
  userId: string | null
  /** Bestaande rij van deze gebruiker; null = bij de eerste wijziging aanmaken. */
  rijId: string | null
  onRijId: (id: string) => void
  kolommen: KolomConfig[]
  actiefLayoutId: string | null
  /** Pas opslaan als de bewaarde stand is teruggezet; anders overschrijft de standaard hem. */
  klaar: boolean
}) {
  const sleutel = JSON.stringify(kolommen) + '|' + (actiefLayoutId ?? '')
  const vorige = useRef<string | null>(null)

  useEffect(() => {
    if (!klaar || !userId) return
    // De eerste stand na het laden is de teruggezette: die hoeft niet opnieuw de database in.
    if (vorige.current === null) { vorige.current = sleutel; return }
    if (vorige.current === sleutel) return
    vorige.current = sleutel
    // Slepen aan een kolombreedte geeft tientallen wijzigingen; alleen de laatste telt.
    const timer = setTimeout(() => {
      void slaLayoutOp(userId, LAATST_SCHERM, actiefLayoutId ?? '', kolommen, rijId ?? undefined)
        .then(res => { if (res.ok && !rijId && res.id) onRijId(res.id) })
        .catch(() => { /* niet kritiek: de volgende wijziging probeert het opnieuw */ })
    }, WACHT_MS)
    return () => clearTimeout(timer)
  }, [klaar, userId, sleutel, kolommen, actiefLayoutId, rijId, onRijId])
}
