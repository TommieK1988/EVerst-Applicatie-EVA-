import { isPreviewOmgeving } from '@/lib/omgeving/omgeving'

/**
 * Oranje kader rond het hele scherm, met een label onderaan, op elke Vercel-preview.
 *
 * Een preview ziet er verder precies zo uit als de live site, maar schrijft in dezelfde
 * database. Bewust een kader over het scherm heen en geen balk erboven: een balk duwt
 * elk scherm van 100dvh omlaag en zet er een scrollbalk op. Het kader vangt geen
 * kliks (pointer-events: none), dus eronder werkt alles gewoon.
 */
export default function TestomgevingKader() {
  if (!isPreviewOmgeving()) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] border-4 border-warning-500">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-md bg-warning-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white shadow-md">
        Testomgeving · wijzigingen gaan naar de echte database
      </div>
    </div>
  )
}
