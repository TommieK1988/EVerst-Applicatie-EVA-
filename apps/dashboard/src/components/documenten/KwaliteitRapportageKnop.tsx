'use client'

/**
 * Knop "Rapport opstellen" op het inspectiedetail en in het kwaliteitsblok op de dossiertab.
 *
 * Opent de bestaande sjabloonkiezer — voorgefilterd op documentsoort `kwaliteitsrapport` — en
 * daarna de gewone genereermodal. Zo krijgt het rapport de hele documentenpijplijn gratis mee:
 * live preview, PDF via Word, briefpapier, bewerken in Word Online, archiveren in de dossiermap en
 * mailen. Patroon 1-op-1 van `HoutrotRapportageKnop`.
 *
 * `inspectieId` wordt als voorkeuze meegegeven, zodat het rapport over de inspectie gaat die je
 * op dat moment bekijkt in plaats van over de meest recente.
 */

import { useEffect, useState } from 'react'
import { FileBarChart2 } from 'lucide-react'
import { getSjablonenVoorDossier } from '@/app/(platform)/documenten/actions'
import type { DocumentSjabloon } from '@/lib/documenten/types'
import {
  KWALITEIT_OPTIES_SLEUTEL, STANDAARD_KWALITEIT_OPTIES, serialiseerKwaliteitOpties,
} from '@/lib/documenten/kwaliteit-opties'
import SjabloonKiezerModal from './SjabloonKiezerModal'
import DocumentGenereerModal from './DocumentGenereerModal'

export default function KwaliteitRapportageKnop({
  dossierId,
  inspectieId,
  compact = false,
}: {
  dossierId: string
  /** Voorkeuze voor het `kwaliteit_opties`-veld. */
  inspectieId?: string
  compact?: boolean
}) {
  const [sjablonen, setSjablonen] = useState<DocumentSjabloon[] | null>(null)
  const [kiezen, setKiezen] = useState(false)
  const [gekozen, setGekozen] = useState<DocumentSjabloon | null>(null)

  useEffect(() => {
    getSjablonenVoorDossier(dossierId)
      .then(lijst => setSjablonen(lijst.filter(s => s.documentsoort === 'kwaliteitsrapport')))
      .catch(() => setSjablonen([]))
  }, [dossierId])

  // Geen rapportsjabloon ingericht → geen knop, in plaats van een knop die uitkomt op een lege
  // lijst. Zelfde keuze als bij de houtrot-rapportage.
  if (!sjablonen || sjablonen.length === 0) return null

  const voorgevuld = inspectieId
    ? {
        [KWALITEIT_OPTIES_SLEUTEL]: serialiseerKwaliteitOpties({
          ...STANDAARD_KWALITEIT_OPTIES,
          inspectie_id: inspectieId,
        }),
      }
    : undefined

  return (
    <>
      <button
        type="button"
        onClick={() => (sjablonen.length === 1 ? setGekozen(sjablonen[0]) : setKiezen(true))}
        className={compact
          ? 'flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50'
          : 'flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'}
      >
        <FileBarChart2 className="h-4 w-4" /> Rapport opstellen
      </button>

      {kiezen && (
        <SjabloonKiezerModal
          titel="Kwaliteitsrapport opstellen"
          sjablonen={sjablonen}
          onKies={s => { setKiezen(false); setGekozen(s) }}
          onSluit={() => setKiezen(false)}
        />
      )}

      {gekozen && (
        <DocumentGenereerModal
          dossierId={dossierId}
          sjabloon={gekozen}
          beginInvoer={voorgevuld}
          onSluit={() => setGekozen(null)}
          onKlaar={() => setGekozen(null)}
        />
      )}
    </>
  )
}
