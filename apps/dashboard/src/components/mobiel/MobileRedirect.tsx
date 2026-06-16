'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'

/**
 * Stuurt telefoon-viewports (<768px) door naar de aparte mobiele omgeving `/m`.
 * Desktop/tablet blijven de gewone app. Gemonteerd in de (platform)-layout.
 * Op `/m` zelf draait dit niet (andere route-groep) → geen redirect-loop.
 */
export default function MobileRedirect() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const alOpMobiel = pathname === '/m' || pathname.startsWith('/m/')
    if (isMobile && !alOpMobiel) {
      router.replace('/m')
    }
  }, [isMobile, pathname, router])

  return null
}
