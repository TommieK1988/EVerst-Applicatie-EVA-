'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, FileText, MessageSquare, Tag } from 'lucide-react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter,
  Badge, Button, Textarea,
} from '@/components/ui'
import { Sectie } from '@/components/dossiers/NieuweAanvraagOnderdelen'
import {
  getInkoopfactuurDetail, plaatsInkoopfactuurOpmerking, ververInkoopfactuur,
  type InkoopfactuurDetail,
} from '@/lib/inkoopfacturen/actions'
import { inkoopStatusLabel, approvalStatusLabel, BOUW7_APPROVAL_STATUS } from '@/lib/bouw7/inkoop-status'
import { dossierHref, type InkoopfactuurRij } from '@/lib/inkoopfacturen/types'
import EvaGoedkeuringSectie from './EvaGoedkeuringSectie'
import BewakingscodeKiezer from './BewakingscodeKiezer'
import Veld from './Veld'

/**
 * Zijpaneel van één inkoopfactuur. Opmaak volgt het venster "Nieuwe aanvraag": secties met een
 * gekleurde kop, veldlabels in UPPERCASE 10,5px en de DS-klassen — de eerste versie met inline
 * stijlen en grijze tekst op een smal paneel was slecht leesbaar.
 */

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const BOUW7_STAP_TOON: Record<number, 'warning' | 'error' | 'success'> = {
  [BOUW7_APPROVAL_STATUS.OPEN]: 'warning',
  [BOUW7_APPROVAL_STATUS.AFGEKEURD]: 'error',
  [BOUW7_APPROVAL_STATUS.GOEDGEKEURD]: 'success',
}

type Props = {
  rij: InkoopfactuurRij | null
  magAccorderen: boolean
  /** Opent het factuurdocument in een venster i.p.v. een nieuw tabblad. */
  onFactuurOpenen: (rij: InkoopfactuurRij) => void
  onClose: () => void
  /** Na een besluit in EVA: de lijst opnieuw laden. */
  onGewijzigd?: () => void
}

export default function InkoopfactuurPaneel({ rij, magAccorderen, onFactuurOpenen, onClose, onGewijzigd }: Props) {
  const evaKeurt = rij?.goedkeuring_bron === 'eva'
  // Net gewijzigde code tonen; de rij zelf komt pas met de volgende refresh van de lijst.
  const [nieuweCode, setNieuweCode] = useState<{ id: string; code: string; naam: string | null } | null>(null)
  const code = nieuweCode && nieuweCode.id === rij?.id
    ? { code: nieuweCode.code, naam: nieuweCode.naam }
    : { code: rij?.bewakingscode ?? null, naam: rij?.bewakingscode_naam ?? null }
  const [detail, setDetail] = useState<InkoopfactuurDetail | null>(null)
  const [laden, setLaden] = useState(false)
  const [nieuweOpmerking, setNieuweOpmerking] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (!rij) { setDetail(null); return }
    let afgebroken = false
    setLaden(true)
    setFout(null)
    getInkoopfactuurDetail(rij.id)
      .then(d => { if (!afgebroken) setDetail(d) })
      .catch(e => { if (!afgebroken) setFout(e instanceof Error ? e.message : 'Laden mislukt') })
      .finally(() => { if (!afgebroken) setLaden(false) })
    return () => { afgebroken = true }
  }, [rij])

  async function herlaad() {
    if (!rij) return
    setDetail(await getInkoopfactuurDetail(rij.id))
  }

  async function opslaanOpmerking() {
    if (!rij || !nieuweOpmerking.trim()) return
    setBezig(true)
    const res = await plaatsInkoopfactuurOpmerking(rij.id, nieuweOpmerking)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setNieuweOpmerking('')
    setFout(null)
    await herlaad()
  }

  async function ververs() {
    if (!rij) return
    setBezig(true)
    const res = await ververInkoopfactuur(rij.id)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    await herlaad()
  }

  const href = rij ? dossierHref(rij) : null
  const projectTekst = rij ? [rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ') : ''

  return (
    <Drawer open={!!rij} onOpenChange={open => { if (!open) onClose() }}>
      <DrawerContent width={560}>
        {rij && (
          <>
            <DrawerHeader>
              <DrawerTitle>{rij.leverancier_naam ?? 'Inkoopfactuur'}</DrawerTitle>
              <DrawerDescription>
                {rij.factuurnummer ?? '—'} · <strong className="text-neutral-900">{euro(rij.bedrag_incl)}</strong> · {inkoopStatusLabel(rij.bouw7_status)}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="bg-neutral-50">
              {fout && <p className="mb-3 text-[13px] text-error-700">{fout}</p>}

              <Sectie titel="Factuur" omschrijving="Zoals de leverancier hem stuurde" icoon={FileText}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Veld label="Leverancier" breed>{rij.leverancier_naam ?? '—'}</Veld>
                  <Veld label="Factuurnummer">{rij.factuurnummer ?? '—'}</Veld>
                  <Veld label="Bon / order">{rij.bon_nummer ?? rij.ordernummer ?? '—'}</Veld>
                  <Veld label="Bedrag excl.">{euro(rij.bedrag_excl)}</Veld>
                  <Veld label="Btw">{euro(rij.btw_bedrag)}</Veld>
                  <Veld label="Bedrag incl."><strong>{euro(rij.bedrag_incl)}</strong></Veld>
                  <Veld label="Vervaldatum">{datum(rij.vervaldatum)}</Veld>
                  <Veld label="Factuurdatum">{datum(rij.factuurdatum)}</Veld>
                  <Veld label="Administratie">{rij.divisie_naam ?? '—'}</Veld>
                  {rij.bouw7_opmerking && <Veld label="Omschrijving" breed>{rij.bouw7_opmerking}</Veld>}
                  {rij.markering_betalen && (
                    <Veld label="Betalen" breed><Badge tone="success" size="md">Aangemerkt om te betalen</Badge></Veld>
                  )}
                </div>
                <Button variant="outline" size="sm" className="self-start" onClick={() => onFactuurOpenen(rij)}>
                  Factuur bekijken
                </Button>
              </Sectie>

              <Sectie titel="Kosten" omschrijving="Waar deze factuur op geboekt staat" icoon={Tag}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Veld label="Project" breed>
                    {rij.bouw7_project_id == null
                      ? <span className="italic text-neutral-500">geen project (overhead)</span>
                      : href
                        ? <a href={href} className="font-semibold text-brand-700 hover:underline">{projectTekst || 'Naar het dossier'}</a>
                        : projectTekst || '—'}
                  </Veld>
                  <Veld label="Bewakingscode" breed>
                    {code.code ? <><strong>{code.code}</strong>{code.naam ? ` · ${code.naam}` : ''}</> : '—'}
                  </Veld>
                </div>
                {/* Wijzigen mag iedereen met schrijfrecht op inkoop (o.a. de financiële administratie),
                    niet alleen de goedkeurder — het raakt de kostenverdeling, niet de goedkeuring. */}
                {magAccorderen && rij.bouw7_project_id != null && (
                  <BewakingscodeKiezer inkoopfactuurId={rij.id} onGewijzigd={n => {
                    setNieuweCode({ id: rij.id, ...n })
                    onGewijzigd?.()
                  }} />
                )}
              </Sectie>

              {evaKeurt && <EvaGoedkeuringSectie inkoopfactuurId={rij.id} onGewijzigd={() => onGewijzigd?.()} />}

              {!evaKeurt && (
                <Sectie titel="Goedkeuring in Bouw7" omschrijving="Deze factuur wordt in Bouw7 goedgekeurd" icoon={CheckCircle2}>
                  {laden && <p className="text-[13px] text-neutral-500">Laden…</p>}
                  {!laden && (detail?.goedkeurders.length ?? 0) === 0 && (
                    <p className="text-[13px] text-neutral-500">Voor deze factuur loopt geen goedkeuring in Bouw7.</p>
                  )}
                  {(detail?.goedkeurders.length ?? 0) > 0 && (
                    <ol className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                      {detail!.goedkeurders.map(stap => (
                        <li key={stap.id} className="flex items-start gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-neutral-900">
                              {stap.volgorde != null ? `${stap.volgorde}. ` : ''}{stap.naam ?? 'Onbekend'}
                            </div>
                            {stap.besloten_op && <div className="text-xs text-neutral-500">{datum(stap.besloten_op)}</div>}
                            {stap.opmerking && <p className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-800">{stap.opmerking}</p>}
                          </div>
                          <Badge size="md" tone={BOUW7_STAP_TOON[stap.status ?? -1] ?? 'neutral'} className="shrink-0">
                            {approvalStatusLabel(stap.status)}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                  {/* Stemmen namens een medewerker kan onze API-sleutel niet (WRITE-ENDPOINTS §7c). */}
                  {rij.mijn_beurt && (
                    <div className="flex flex-col gap-2 rounded-lg border border-warning-100 bg-warning-50 p-3">
                      <p className="text-[13px] text-neutral-900">
                        <strong>Jij bent aan zet.</strong> Deze factuur zat al in de goedkeuring van Bouw7 en wordt daar afgemaakt.
                      </p>
                      <a href={`https://start.bouw7.nl/purchase-invoice#/view/${rij.bouw7_invoice_id}`} target="_blank" rel="noreferrer" className="self-start">
                        <Button size="sm" variant="primary">Openen in Bouw7</Button>
                      </a>
                    </div>
                  )}
                </Sectie>
              )}

              <Sectie titel="Notities" omschrijving="Blijven in EVA; komen niet in Bouw7" icoon={MessageSquare}>
                {(detail?.opmerkingen.length ?? 0) === 0 && !laden && (
                  <p className="text-[13px] text-neutral-500">Nog geen notities.</p>
                )}
                {(detail?.opmerkingen.length ?? 0) > 0 && (
                  <ul className="flex flex-col gap-2">
                    {detail!.opmerkingen.map(o => (
                      <li key={o.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                        <div className="text-xs text-neutral-500">
                          <strong className="text-neutral-700">{o.medewerker_naam ?? 'Onbekend'}</strong> · {new Date(o.created_at).toLocaleString('nl-NL')}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-neutral-900">{o.tekst}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {magAccorderen && (
                  <>
                    <Textarea
                      value={nieuweOpmerking}
                      onChange={e => setNieuweOpmerking(e.target.value)}
                      placeholder="Notitie bij deze factuur"
                      rows={3}
                    />
                    <Button size="sm" variant="outline" className="self-start" disabled={bezig || !nieuweOpmerking.trim()} onClick={opslaanOpmerking}>
                      Notitie opslaan
                    </Button>
                  </>
                )}
              </Sectie>
            </DrawerBody>

            <DrawerFooter>
              <Button variant="ghost" size="sm" disabled={bezig} onClick={ververs} className="mr-auto">Verversen uit Bouw7</Button>
              <Button variant="outline" size="sm" onClick={onClose}>Sluiten</Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
