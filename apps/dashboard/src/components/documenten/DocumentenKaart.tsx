'use client'

/**
 * "Documenten opstellen"-kaart, bovenaan het Bestanden-tab van een dossier.
 *
 * Twee helften: de knop met de beschikbare sjablonen, en de historie van wat er
 * eerder is opgesteld. Het bestand zelf leeft in SharePoint (en verschijnt dus ook
 * in de SharePoint-kaart eronder); deze lijst is de EVA-registratie.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { FilePlus2 } from 'lucide-react'
import { getSjablonenVoorDossier, getDossierDocumenten, verwijderDossierDocument } from '@/app/(platform)/documenten/actions'
import { documentsoortLabels, heeftTemplate, type DocumentSjabloon, type DossierDocument } from '@/lib/documenten/types'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import DocumentGenereerModal from './DocumentGenereerModal'
import SjabloonKiezerModal from './SjabloonKiezerModal'

const TH = 'py-1.5 px-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-400'

export default function DocumentenKaart({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [sjablonen, setSjablonen] = useState<DocumentSjabloon[] | null>(null)
  const [documenten, setDocumenten] = useState<DossierDocument[]>([])
  const [kiezen, setKiezen] = useState(false)
  const [actief, setActief] = useState<{ sjabloon: DocumentSjabloon; invoer?: Record<string, unknown> } | null>(null)
  const [, start] = useTransition()

  const laadDocumenten = useCallback(() => {
    getDossierDocumenten(dossierId).then(setDocumenten).catch(() => setDocumenten([]))
  }, [dossierId])

  useEffect(() => {
    getSjablonenVoorDossier(dossierId).then(setSjablonen).catch(() => setSjablonen([]))
    laadDocumenten()
  }, [dossierId, laadDocumenten])

  // Sjablonen zonder Word-template zouden bij het opstellen een 422 geven — die
  // bieden we niet aan.
  const bruikbaar = (sjablonen ?? []).filter(heeftTemplate)

  function verwijder(id: string) {
    if (!confirm('Deze registratie verwijderen? Het bestand blijft in SharePoint staan.')) return
    start(async () => {
      try {
        await verwijderDossierDocument(id, dossierId)
        setDocumenten(d => d.filter(x => x.id !== id))
      } catch { toast.error('Verwijderen mislukt') }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Documenten</span>
            {!readOnly && bruikbaar.length > 0 && (
              <button
                onClick={() => setKiezen(true)}
                className="flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-700"
              >
                <FilePlus2 className="h-3.5 w-3.5" /> Document opstellen
              </button>
            )}
          </div>
        </CardHeader>
        <CardBody style={{ padding: documenten.length ? 0 : undefined }}>
          {/* Historie */}
          {sjablonen == null ? (
            <p className="text-[13px] text-neutral-500">Laden…</p>
          ) : bruikbaar.length === 0 && documenten.length === 0 ? (
            <p className="text-[13px] text-neutral-500">
              Nog geen documentsjablonen ingericht. Een beheerder maakt ze aan onder
              Instellingen → Documentsjablonen.
            </p>
          ) : documenten.length === 0 ? (
            <p className="text-[13px] text-neutral-500">
              Nog geen documenten opgesteld voor dit dossier.
            </p>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-left">
                    <th className={`${TH} pl-4`}>Document</th><th className={TH}>Soort</th>
                    <th className={TH}>Opgesteld</th><th className={TH}>Door</th>
                    <th className={TH}>Gemaild</th><th className={`${TH} pr-4 text-right`}>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {documenten.map(d => (
                    <tr key={d.id} className="border-b border-neutral-100 text-[12.5px]">
                      <td className="py-1.5 pl-4 pr-2 text-neutral-800">{d.bestandsnaam}</td>
                      <td className="py-1.5 px-2 text-neutral-500">{documentsoortLabels[d.documentsoort as never] ?? d.documentsoort}</td>
                      <td className="py-1.5 px-2 text-neutral-500">{datum(d.gegenereerd_op)}</td>
                      <td className="py-1.5 px-2 text-neutral-500">{d.gegenereerd_door_naam ?? '—'}</td>
                      <td className="py-1.5 px-2 text-neutral-500">
                        {d.gemaild_op ? `${datum(d.gemaild_op)}${d.gemaild_naar?.length ? ` → ${d.gemaild_naar.join(', ')}` : ''}` : '—'}
                      </td>
                      <td className="py-1.5 pl-2 pr-4 text-right whitespace-nowrap">
                        {d.sharepoint_web_url && (
                          <a href={d.sharepoint_web_url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-medium text-brand-600 hover:underline">Openen</a>
                        )}
                        {!readOnly && d.sjabloon_id && (
                          <button
                            onClick={() => {
                              const s = (sjablonen ?? []).find(x => x.id === d.sjabloon_id)
                              if (!s) { toast.error('Sjabloon bestaat niet meer'); return }
                              setActief({ sjabloon: s, invoer: d.invoer })
                            }}
                            className="ml-3 text-[11px] font-medium text-neutral-500 hover:underline"
                          >
                            Opnieuw
                          </button>
                        )}
                        {!readOnly && (
                          <button onClick={() => verwijder(d.id)} className="ml-3 text-[11px] text-neutral-400 hover:text-red-600">
                            Verwijderen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 text-[11px] text-neutral-500">
                Opgestelde documenten worden bewaard in de SharePoint-dossiermap.
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {kiezen && !readOnly && (
        <SjabloonKiezerModal
          sjablonen={bruikbaar}
          onKies={s => { setActief({ sjabloon: s }); setKiezen(false) }}
          onSluit={() => setKiezen(false)}
        />
      )}

      {actief && (
        <DocumentGenereerModal
          dossierId={dossierId}
          sjabloon={actief.sjabloon}
          beginInvoer={actief.invoer}
          onSluit={() => setActief(null)}
          onKlaar={laadDocumenten}
        />
      )}
    </>
  )
}

function datum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}
