'use client'
import { useSyncExternalStore } from 'react'

/**
 * SSR-veilige media-query hook op basis van useSyncExternalStore + matchMedia.
 *
 * - Geen dependency nodig.
 * - Op de server (en eerste client-render vóór hydratie) is `serverSnapshot`
 *   leidend: false. De shell rendert dus desktop-first en schakelt na hydratie
 *   naar mobiel als de query matcht — voorkomt hydration-mismatch warnings.
 */
export function useMediaQuery(query: string): boolean {
  function subscribe(callback: () => void) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mql = window.matchMedia(query)
    // addEventListener('change') is breed ondersteund; addListener als fallback.
    if (mql.addEventListener) {
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    }
    mql.addListener(callback)
    return () => mql.removeListener(callback)
  }

  function getSnapshot() {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }

  function getServerSnapshot() {
    return false
  }

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Mobiele modus = smaller dan de `md`-breakpoint (768px).
 * Houd deze grens gelijk aan de `@media (max-width: 767px)` blokken in
 * globals.css en aan de EVA breakpoint-conventie in de Tailwind-preset.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
