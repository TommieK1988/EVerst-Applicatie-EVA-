'use client'

import { useState } from 'react'
import ProjectZoeker from '@/components/mobiel/uren/ProjectZoeker'
import type { DossierOptie } from '@/lib/uren/weekstaat'

/** De projectkeuze uit de urenregel met verzonnen projecten; de keuze leeft alleen in dit scherm. */

const OPTIES: DossierOptie[] = [
  { id: 'p1', label: '20267.00660 · Kerkstraat 12, Zwolle – schilderwerk buitenzijde', indirect: false, servicedesk: false, vandaag: true },
  { id: 'p2', label: '20261.00742 · VvE De Linde – houtrotherstel kozijnen', indirect: false, servicedesk: false, vandaag: false },
  { id: 'p3', label: '20267.00571 · Woonzorg Oost – mutatie Lindelaan 4', indirect: false, servicedesk: true, vandaag: false },
  { id: 'p4', label: '20265.00183 · Indirecte uren: Schildersbedrijf Everts', indirect: true, servicedesk: false, vandaag: false },
]

export default function ProjectZoekerVoorbeeld() {
  const [gekozen, setGekozen] = useState('')
  return <ProjectZoeker opties={OPTIES} laden={false} gekozenId={gekozen} onKies={setGekozen} />
}
