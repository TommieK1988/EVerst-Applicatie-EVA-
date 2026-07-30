'use client'

/**
 * Knop "Rapportage" in de Houtrot-tab. Opent de bestaande sjabloonkiezer —
 * voorgefilterd op documentsoort `houtrot_rapportage` — en daarna de gewone
 * genereermodal. Zo krijgt de rapportage gratis de hele documentenpijplijn mee:
 * live preview, PDF, bewerken in Word, archiveren in de dossiermap en mailen.
 *
 * Meerdere "versies" (met en zonder verkoopprijzen) zijn simpelweg meerdere
 * sjabloonrijen; hier is daar niets voor nodig.
 */

import { useEffect, useState } from 'react'
import { FileBarChart2 } from 'lucide-react'
import { getSjablonenVoorDossier } from '@/app/(platform)/documenten/actions'
import type { DocumentSjabloon } from '@/lib/documenten/types'
import SjabloonKiezerModal from './SjabloonKiezerModal'
import DocumentGenereerModal from './DocumentGenereerModal'

export default function HoutrotRapportageKnop({ dossierId }: { dossierId: string }) {
  const [sjablonen, setSjablonen] = useState<DocumentSjabloon[] | null>(null)
  const [kiezen, setKiezen] = useState(false)
  const [gekozen, setGekozen] = useState<DocumentSjabloon | null>(null)

  useEffect(() => {
    getSjablonenVoorDossier(dossierId)
      .then(lijst => setSjablonen(lijst.filter(s => s.documentsoort === 'houtrot_rapportage')))
      .catch(() => setSjablonen([]))
  }, [dossierId])

  // Geen rapportagesjabloon ingericht → geen knop, in plaats van een knop die
  // uitkomt op een lege lijst.
  if (!sjablonen || sjablonen.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (sjablonen.length === 1 ? setGekozen(sjablonen[0]) : setKiezen(true))}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        <FileBarChart2 className="h-4 w-4" /> Rapportage
      </button>

      {kiezen && (
        <SjabloonKiezerModal
          titel="Houtrot-rapportage opstellen"
          sjablonen={sjablonen}
          onKies={s => { setKiezen(false); setGekozen(s) }}
          onSluit={() => setKiezen(false)}
        />
      )}

      {gekozen && (
        <DocumentGenereerModal
          dossierId={dossierId}
          sjabloon={gekozen}
          onSluit={() => setGekozen(null)}
          onKlaar={() => setGekozen(null)}
        />
      )}
    </>
  )
}
