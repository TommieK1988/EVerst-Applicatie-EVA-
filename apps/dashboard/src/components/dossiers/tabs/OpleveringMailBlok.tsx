'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Badge } from '@/components/ui'
import OntvangerVeld, { useMailOntvangers } from '@/components/mail/OntvangerVeld'
import {
  getOpleverMailWachtrij, verstuurOpleverMailWachtrij, annuleerOpleverMail, queueRapportageMail,
  type OpleverMailItem,
} from '@/lib/dossiers/oplevering-mail'

const SOORT_LABEL: Record<string, string> = {
  rapportage: 'Opleverrapportage',
  herinnering: 'Herinnering onderaannemer',
  feedback_uitnodiging: 'Feedback-uitnodiging',
}

/**
 * Mail-blok van de Oplevering-tab. Alles wat EVA klaarzet (rapportages, cron-herinneringen,
 * feedback-uitnodigingen) verzamelt zich hier en gaat pas de deur uit als iemand hier op
 * "Nu versturen" klikt — mail wordt via Outlook namens de ingelogde medewerker verstuurd.
 */
export default function OpleveringMailBlok({
  dossierId, momenten, readOnly,
}: {
  dossierId: string
  /** Momenten om een rapportage van te mailen (id + titel). */
  momenten: { id: string; titel: string }[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [wachtrij, setWachtrij] = useState<OpleverMailItem[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [momentId, setMomentId] = useState('')
  const [aan, setAan] = useState('')
  const [cc, setCc] = useState('')
  const { ontvangers, laden: ontvangersLaden } = useMailOntvangers(formOpen && !readOnly, { dossierId })

  function herlaad() {
    getOpleverMailWachtrij(dossierId).then(setWachtrij).catch(() => setWachtrij([]))
  }
  useEffect(() => {
    herlaad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])
  useEffect(() => {
    if (!momentId && momenten[0]) setMomentId(momenten[0].id)
  }, [momenten, momentId])

  async function zetRapportageKlaar() {
    if (!momentId) { toast.error('Kies een oplevermoment.'); return }
    if (!aan.trim()) { toast.error('Vul minstens één e-mailadres in.'); return }
    setBezig(true)
    const r = await queueRapportageMail(momentId, aan, cc || undefined)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Rapportage klaargezet — controleer en verstuur hieronder')
    setAan(''); setCc(''); setFormOpen(false); herlaad()
  }

  async function verstuurAlles() {
    setBezig(true)
    const r = await verstuurOpleverMailWachtrij(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    if (r.verzonden === 0 && r.mislukt === 0) toast('Niets te versturen', { icon: 'ℹ️' })
    else if (r.mislukt > 0) toast(`${r.verzonden} verzonden, ${r.mislukt} mislukt — zie de foutmelding`, { icon: '⚠️', duration: 6000 })
    else toast.success(`${r.verzonden} bericht(en) verzonden`)
    herlaad(); router.refresh()
  }

  async function annuleer(id: string) {
    setBezig(true)
    const r = await annuleerOpleverMail(id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    herlaad()
  }

  const aantal = wachtrij?.length ?? 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Mail
            {aantal > 0 && <Badge tone="warning" size="sm">{aantal} klaargezet</Badge>}
          </span>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {momenten.length > 0 && (
                <Button variant="secondary" onClick={() => setFormOpen(o => !o)} disabled={bezig}>
                  {formOpen ? 'Annuleren' : 'Rapportage mailen'}
                </Button>
              )}
              {aantal > 0 && (
                <Button variant="primary" onClick={verstuurAlles} disabled={bezig}>
                  Nu versturen ({aantal})
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {formOpen && !readOnly && (
          <div className="mb-4 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-medium text-neutral-700 sm:col-span-2">
                Oplevermoment
                <select className="mt-1 h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[12px]"
                  value={momentId} onChange={e => setMomentId(e.target.value)}>
                  {momenten.map(m => <option key={m.id} value={m.id}>{m.titel}</option>)}
                </select>
              </label>
              <div className="text-[12px] font-medium text-neutral-700">
                Aan (opdrachtgever)
                <OntvangerVeld className="mt-1" waarde={aan} onChange={setAan}
                  ontvangers={ontvangers} laden={ontvangersLaden}
                  placeholder="Adres typen of contactpersoon kiezen…" />
              </div>
              <div className="text-[12px] font-medium text-neutral-700">
                CC — overige betrokkenen
                <OntvangerVeld className="mt-1" waarde={cc} onChange={setCc}
                  ontvangers={ontvangers} laden={ontvangersLaden}
                  placeholder="Bijvoorbeeld een collega…" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {momentId ? (
                <a href={`/api/oplevering/rapport/${momentId}/pdf`} target="_blank" rel="noreferrer"
                  className="text-[11.5px] font-medium text-brand-600 hover:underline">
                  📎 Bekijk de PDF-bijlage
                </a>
              ) : <span />}
              <Button variant="primary" onClick={zetRapportageKlaar} disabled={bezig}>Klaarzetten</Button>
            </div>
          </div>
        )}

        {wachtrij == null ? (
          <p className="text-[12.5px] text-neutral-400">Wachtrij laden…</p>
        ) : wachtrij.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            Geen berichten klaargezet. Herinneringen aan onderaannemers en feedback-uitnodigingen verschijnen hier
            automatisch; ze gaan pas weg als je hierboven op versturen klikt.
          </p>
        ) : (
          <div className="space-y-2">
            {wachtrij.map(m => (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.status === 'mislukt' ? 'error' : 'neutral'} size="sm">
                      {SOORT_LABEL[m.soort] ?? m.soort}
                    </Badge>
                    {m.status === 'mislukt' && <span className="text-[11px] text-error-600">na {m.pogingen} pogingen mislukt</span>}
                  </div>
                  <div className="mt-1 text-[12.5px] font-medium text-neutral-800">{m.onderwerp}</div>
                  <div className="text-[11px] text-neutral-500">Aan: {m.ontvangers.join(', ')}{m.cc.length > 0 && ` · CC: ${m.cc.join(', ')}`}</div>
                  {m.laatste_fout && <div className="mt-1 text-[11px] text-error-600">{m.laatste_fout}</div>}
                </div>
                {!readOnly && (
                  <button className="text-[11px] font-medium text-neutral-500 hover:underline" disabled={bezig}
                    onClick={() => annuleer(m.id)}>
                    Annuleren
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
