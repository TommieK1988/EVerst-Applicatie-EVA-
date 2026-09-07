'use client'

/**
 * Knop "Rapport opstellen" bij elke controle op locatie: de Oplevering-tab, het
 * kwaliteitsblok op de VCA-tab, het inspectiedetail en een formulierinzending.
 *
 * Overal dezelfde knop en hetzelfde sjabloon — dat is de hele bedoeling van het
 * bezoekrapport. `bron` vult het bezoek voor, zodat het rapport gaat over wat je op dat
 * moment op je scherm hebt in plaats van over het meest recente bezoek.
 *
 * Patroon 1-op-1 van `KwaliteitRapportageKnop`, inclusief het gedrag "geen sjabloon
 * ingericht → geen knop": beter geen knop dan een knop die uitkomt op een lege lijst.
 */

import { useEffect, useState } from 'react'
import { FileBarChart2 } from 'lucide-react'
import { getSjablonenVoorDossier } from '@/app/(platform)/documenten/actions'
import type { DocumentSjabloon } from '@/lib/documenten/types'
import { BEZOEK_DOCUMENTSOORT } from '@/lib/documenten/types'
import type { BezoekSoort } from '@/lib/documenten/bezoek/contract'
import {
  BEZOEK_OPTIES_SLEUTEL, STANDAARD_BEZOEK_OPTIES, serialiseerBezoekOpties,
} from '@/lib/documenten/bezoek-opties'
import SjabloonKiezerModal from './SjabloonKiezerModal'
import DocumentGenereerModal from './DocumentGenereerModal'

export default function BezoekRapportageKnop({
  dossierId,
  bron,
  compact = false,
  label = 'Rapport opstellen',
}: {
  dossierId: string
  /** Voorkeuze voor het `bezoek_opties`-veld: welk bezoek staat er op dit scherm? */
  bron?: { soort: BezoekSoort; id: string }
  compact?: boolean
  label?: string
}) {
  const [sjablonen, setSjablonen] = useState<DocumentSjabloon[] | null>(null)
  const [kiezen, setKiezen] = useState(false)
  const [gekozen, setGekozen] = useState<DocumentSjabloon | null>(null)

  useEffect(() => {
    getSjablonenVoorDossier(dossierId)
      .then(lijst => setSjablonen(lijst.filter(s => s.documentsoort === BEZOEK_DOCUMENTSOORT)))
      .catch(() => setSjablonen([]))
  }, [dossierId])

  if (!sjablonen || sjablonen.length === 0) return null

  const voorgevuld = bron
    ? {
        [BEZOEK_OPTIES_SLEUTEL]: serialiseerBezoekOpties({
          ...STANDAARD_BEZOEK_OPTIES,
          bron_soort: bron.soort,
          bron_id: bron.id,
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
        <FileBarChart2 className="h-4 w-4" /> {label}
      </button>

      {kiezen && (
        <SjabloonKiezerModal
          titel="Bezoekrapport opstellen"
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
