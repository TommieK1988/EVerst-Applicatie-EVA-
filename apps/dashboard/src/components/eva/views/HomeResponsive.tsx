'use client'
import React from 'react'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import MobileHome, { type MobileTaak, type MobileFormTaak } from './MobileHome'

/**
 * Kiest op `/` tussen het mobiele dashboard en het bestaande desktop-overzicht.
 * Het desktop-overzicht komt als server-gerenderd slot binnen (`children`),
 * zodat de bestaande HomeView ongewijzigd blijft.
 */
export default function HomeResponsive({
  voornaam, taken, formTaken, children,
}: {
  voornaam: string
  taken: MobileTaak[]
  formTaken: MobileFormTaak[]
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  if (isMobile) return <MobileHome voornaam={voornaam} taken={taken} formTaken={formTaken} />
  return <>{children}</>
}
