'use client'

import { useEffect, useState } from 'react'

/**
 * Opent de SharePoint-map in Windows Verkenner in plaats van in de browser.
 *
 * Een webpagina mag zelf geen Verkenner starten, dus dit loopt via het
 * `eva://`-protocol: een kleine handler op de pc vangt de klik op en bepaalt zelf
 * of hij de met OneDrive gesynchroniseerde map of het WebDAV-netwerkpad opent.
 * Uitrol en werking staan in `scripts/eva-verkenner/LEESMIJ.md`.
 *
 * Alleen zichtbaar op Windows: elders bestaat die handler niet en zou de knop
 * niets doen. De gewone SharePoint-link blijft er altijd naast staan, zodat de
 * map ook te openen is op een pc waar de handler nog niet is uitgerold.
 */
export default function OpenInVerkenner({ mapUrl }: { mapUrl: string }) {
  const [opWindows, setOpWindows] = useState(false)

  useEffect(() => {
    setOpWindows(/Windows|Win32|Win64/i.test(navigator.userAgent))
  }, [])

  if (!opWindows) return null

  return (
    <a
      href={`eva://map?url=${encodeURIComponent(mapUrl)}`}
      className="text-[11px] font-medium text-brand-600 hover:underline"
      title="Opent de map in Windows Verkenner. Gebeurt er niets? Dan is de EVA-snelkoppeling nog niet op deze pc geïnstalleerd."
    >
      Open in Verkenner
    </a>
  )
}
