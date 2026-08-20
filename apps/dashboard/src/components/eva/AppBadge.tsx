'use client'

import { useEffect } from 'react'

/**
 * Zet het aantal ongelezen meldingen als tellertje op het app-icoon.
 *
 * Gebruikt de Badging API. Die werkt alleen in een geïnstalleerde app:
 *   * iPhone/iPad — vanaf iOS 16.4, mits EVA op het beginscherm staat én
 *     meldingen zijn toegestaan; het tellertje hangt daar aan die toestemming.
 *   * Windows/macOS — in de geïnstalleerde app (taakbalk/dock).
 *   * Android-Chrome kent het niet; daar gebeurt er niets. Bewust geen namaak-
 *     oplossing: een tellertje op een startscherm-snelkoppeling kan een web-app
 *     daar simpelweg niet zetten.
 *
 * In een gewoon browsertabblad ontbreekt de functie en doet dit component niets.
 * Het aantal komt uit dezelfde teller als het belletje, dus openen en lezen van
 * meldingen werkt het tellertje bij de volgende paginalading vanzelf bij. De
 * service worker houdt het tussentijds bij als er een pushmelding binnenkomt
 * terwijl EVA dicht staat.
 */
export default function AppBadge({ aantal }: { aantal: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (aantal?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return

    // Fouten negeren: op sommige toestellen bestaat de functie wel maar weigert
    // hij zonder toestemming. Dat mag geen melding in beeld opleveren.
    if (aantal > 0) void nav.setAppBadge(aantal).catch(() => {})
    else void nav.clearAppBadge?.().catch(() => {})
  }, [aantal])

  return null
}
