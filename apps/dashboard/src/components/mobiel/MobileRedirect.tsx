'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { bewaarApparaatSoort, isMobielApparaat, MARKER_SMAL_VENSTER } from '@/lib/mobiel-apparaat'

/**
 * Stuurt de mobiele omgeving `/m` binnen. Gemonteerd in de (platform)-layout;
 * op `/m` zelf draait dit niet (andere route-groep) → geen redirect-loop.
 *
 * Twee redenen om uit te wijken, met verschillende gevolgen:
 *
 * - **Mobiel apparaat** (telefoon of tablet, incl. iPad): blijvend. Het apparaat
 *   wordt in een cookie vastgelegd zodat de middleware het vanaf het volgende
 *   verzoek server-side afhandelt; er is geen weg terug naar de platformweergave.
 * - **Smal venster** (<768px) op een desktop: tijdelijk. We onthouden dat we
 *   alleen om de breedte uitweken, zodat `DesktopRedirect` terugstuurt zodra het
 *   venster weer breed is.
 */
export default function MobileRedirect() {
  const smalVenster = useIsMobile()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Ook zonder redirect vastleggen: de middleware kan zo bij het eerstvolgende
    // verzoek al beslissen, ook voor een iPad die zich als Macintosh voorstelt.
    bewaarApparaatSoort()
  }, [])

  useEffect(() => {
    if (pathname === '/m' || pathname.startsWith('/m/')) return

    const apparaat = isMobielApparaat()
    if (!apparaat && !smalVenster) return

    try {
      if (apparaat) sessionStorage.removeItem(MARKER_SMAL_VENSTER)
      else sessionStorage.setItem(MARKER_SMAL_VENSTER, '1')
    } catch { /* privémodus: dan blijft de terugkeer achterwege */ }

    router.replace('/m')
  }, [smalVenster, pathname, router])

  return null
}
