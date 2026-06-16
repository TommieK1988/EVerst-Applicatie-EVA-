'use client'
import React from 'react'
import { usePathname } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import DesktopOnlyNotice from './DesktopOnlyNotice'

/**
 * Gerichte mobiele ingang. Op mobiel (< md) tonen we alleen de modules die voor
 * telefoon/tablet zijn gebouwd; andere routes krijgen een nette "op desktop"-
 * melding i.p.v. een onbruikbare desktop-layout. Op desktop verandert er niets.
 *
 * Mobiel-klare routes (prefix-match, behalve '/'):
 *   /                het mobiele dashboard (zie HomeResponsive)
 *   /taken           Taken
 *   /formulieren     Formulieren (builder gate zit in de pagina zelf)
 *   /account         eigen account (bereikbaar via de gebruikerskaart in de drawer)
 *
 * Breid MOBILE_READY uit zodra een module mobiel af is.
 */
const MOBILE_READY_EXACT = new Set(['/'])
const MOBILE_READY_PREFIX = ['/taken', '/formulieren', '/account']

export default function MobileRouteGuard({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const pathname = usePathname()

  if (!isMobile) return <>{children}</>

  const ready =
    MOBILE_READY_EXACT.has(pathname) ||
    MOBILE_READY_PREFIX.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (ready) return <>{children}</>

  return <DesktopOnlyNotice />
}
