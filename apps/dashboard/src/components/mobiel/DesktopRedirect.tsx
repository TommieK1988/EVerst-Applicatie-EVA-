'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { bewaarApparaatSoort, isMobielApparaat, MARKER_SMAL_VENSTER } from '@/lib/mobiel-apparaat'

/**
 * Tegenhanger van `MobileRedirect`, gemonteerd in de mobiele layout: stuurt
 * terug naar de platformweergave zodra het venster weer breed genoeg is.
 *
 * Bewust alleen voor wie hier ís beland via de breedte-uitwijk (zie
 * {@link MARKER_SMAL_VENSTER}). Een telefoon of iPad hoort thuis in `/m` en
 * wordt nooit teruggestuurd, en wie `/m` zelf opent op een desktop — om de
 * mobiele app te bekijken — blijft gewoon waar hij is.
 *
 * Zonder deze tegenhanger was de uitwijk eenrichtingsverkeer: een desktopvenster
 * dat één keer smal was geweest, bleef de rest van de sessie in de mobiele app.
 */
export default function DesktopRedirect() {
  const smalVenster = useIsMobile()
  const router = useRouter()

  useEffect(() => {
    // Ook hier vastleggen: een iPad die via het beginscherm-icoon meteen op `/m`
    // start komt anders nooit langs `MobileRedirect` en zou dus geen cookie
    // krijgen — precies het apparaat waar het om begonnen was.
    bewaarApparaatSoort()
  }, [])

  useEffect(() => {
    if (smalVenster || isMobielApparaat()) return

    let uitgeweken = false
    try { uitgeweken = sessionStorage.getItem(MARKER_SMAL_VENSTER) === '1' } catch { /* privémodus */ }
    if (!uitgeweken) return

    try { sessionStorage.removeItem(MARKER_SMAL_VENSTER) } catch { /* idem */ }
    router.replace('/')
  }, [smalVenster, router])

  return null
}
