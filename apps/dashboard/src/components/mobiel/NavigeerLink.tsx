'use client'

import React, { useEffect, useState } from 'react'
import { leesNavigatieApp, navigatieLink, STANDAARD_NAVIGATIE_APP, type NavigatieApp } from '@/lib/mobiel/navigatie'

/**
 * Een `<a>` naar de route in de navigatie-app die op dit toestel gekozen is
 * (Profiel → Instellingen). Verder een gewone link: stijl en inhoud komen van buiten.
 *
 * De keuze staat in localStorage en is dus pas na het laden te lezen; tot dan wijst de
 * link naar Google Maps, zodat server en client hetzelfde renderen.
 */
export default function NavigeerLink({
  adres, children, ...rest
}: { adres: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const [app, setApp] = useState<NavigatieApp>(STANDAARD_NAVIGATIE_APP)
  useEffect(() => { setApp(leesNavigatieApp()) }, [])

  return (
    <a href={navigatieLink(adres, app)} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  )
}
