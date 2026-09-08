'use client'

import React, { useEffect, useState } from 'react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, Button,
} from '@/components/ui'
import {
  getInkoopfactuurDetail, plaatsInkoopfactuurOpmerking, ververInkoopfactuur,
  type InkoopfactuurDetail,
} from '@/lib/inkoopfacturen/actions'
import { inkoopStatusLabel, approvalStatusLabel, BOUW7_APPROVAL_STATUS } from '@/lib/bouw7/inkoop-status'
import { dossierHref, type InkoopfactuurRij } from '@/lib/inkoopfacturen/types'

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const STAP_KLEUR: Record<number, string> = {
  [BOUW7_APPROVAL_STATUS.OPEN]:       '#f59e0b',
  [BOUW7_APPROVAL_STATUS.AFGEKEURD]:  '#dc2626',
  [BOUW7_APPROVAL_STATUS.GOEDGEKEURD]: '#16a34a',
}

function Regel({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '3px 0' }}>
      <span style={{ width: 130, flexShrink: 0, color: 'var(--fg-soft)' }}>{label}</span>
      <span style={{ color: 'var(--fg)' }}>{waarde}</span>
    </div>
  )
}

type Props = {
  rij: InkoopfactuurRij | null
  magAccorderen: boolean
  /** Opent het factuurdocument in een venster i.p.v. een nieuw tabblad. */
  onFactuurOpenen: (rij: InkoopfactuurRij) => void
  onClose: () => void
}

export default function InkoopfactuurPaneel({ rij, magAccorderen, onFactuurOpenen, onClose }: Props) {
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

  return (
    <Drawer open={!!rij} onOpenChange={open => { if (!open) onClose() }}>
      <DrawerContent width={520}>
        {rij && (
          <>
            <DrawerHeader>
              <DrawerTitle>{rij.factuurnummer ?? 'Inkoopfactuur'} · {euro(rij.bedrag_incl)}</DrawerTitle>
              <DrawerDescription>
                {rij.leverancier_naam ?? '—'} · {inkoopStatusLabel(rij.bouw7_status)}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody>
              {fout && (
                <p style={{ fontSize: 13, color: '#dc2626', marginTop: 0 }}>{fout}</p>
              )}

              <section style={{ marginBottom: 20 }}>
                <Regel label="Leverancier"  waarde={rij.leverancier_naam ?? '—'} />
                <Regel label="Bedrag excl." waarde={euro(rij.bedrag_excl)} />
                <Regel label="BTW"          waarde={euro(rij.btw_bedrag)} />
                <Regel label="Bedrag incl." waarde={<strong>{euro(rij.bedrag_incl)}</strong>} />
                <Regel label="Factuurdatum" waarde={datum(rij.factuurdatum)} />
                <Regel label="Vervaldatum"  waarde={datum(rij.vervaldatum)} />
                <Regel label="Administratie" waarde={rij.divisie_naam ?? '—'} />
                <Regel label="Vestiging"    waarde={rij.vestiging_naam ?? '—'} />
                <Regel
                  label="Project"
                  waarde={
                    rij.bouw7_project_id == null
                      ? <em style={{ color: 'var(--fg-soft)' }}>geen project (overhead)</em>
                      : dossierHref(rij)
                        ? <a href={dossierHref(rij)!}>{[rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ')}</a>
                        : [rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ') || '—'
                  }
                />
                <Regel
                  label="Bewakingscode"
                  waarde={rij.bewakingscode
                    ? `${rij.bewakingscode}${rij.bewakingscode_naam ? ` · ${rij.bewakingscode_naam}` : ''}`
                    : '—'}
                />
                {(rij.bon_nummer || rij.ordernummer) && (
                  <Regel label="Bon / order" waarde={rij.bon_nummer ?? rij.ordernummer} />
                )}
                {rij.bouw7_opmerking && (
                  <Regel label="Omschrijving" waarde={rij.bouw7_opmerking} />
                )}
                {rij.markering_betalen && (
                  <Regel label="Betalen" waarde={<strong style={{ color: '#0f766e' }}>Aangemerkt om te betalen</strong>} />
                )}
              </section>

              <section style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-soft)', margin: '0 0 8px' }}>
                  Fiattering
                </h4>
                {laden && <p style={{ fontSize: 13, color: 'var(--fg-soft)' }}>Laden…</p>}
                {!laden && (detail?.goedkeurders.length ?? 0) === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0 }}>
                    Voor deze factuur loopt geen fiatteringsworkflow in Bouw7.
                  </p>
                )}
                {detail?.goedkeurders.map(stap => (
                  <div key={stap.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: STAP_KLEUR[stap.status ?? -1] ?? 'var(--fg-soft)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {stap.volgorde != null ? `${stap.volgorde}. ` : ''}{stap.naam ?? 'Onbekend'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                        {approvalStatusLabel(stap.status)}
                        {stap.besloten_op ? ` · ${datum(stap.besloten_op)}` : ''}
                      </div>
                      {stap.opmerking && (
                        <p style={{ fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{stap.opmerking}</p>
                      )}
                    </div>
                  </div>
                ))}
              </section>

              <section style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-soft)', margin: '0 0 8px' }}>
                  Notities in EVA
                </h4>
                {(detail?.opmerkingen.length ?? 0) === 0 && !laden && (
                  <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: '0 0 8px' }}>Nog geen notities.</p>
                )}
                {detail?.opmerkingen.map(o => (
                  <div key={o.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                      {o.medewerker_naam ?? 'Onbekend'} · {new Date(o.created_at).toLocaleString('nl-NL')}
                      {o.naar_bouw7 && ' · ook in Bouw7'}
                    </div>
                    <p style={{ fontSize: 13, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{o.tekst}</p>
                  </div>
                ))}

                {magAccorderen && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      value={nieuweOpmerking}
                      onChange={e => setNieuweOpmerking(e.target.value)}
                      placeholder="Notitie bij deze factuur (blijft in EVA)"
                      rows={3}
                      style={{
                        width: '100%', fontSize: 13, padding: 8, borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)',
                        resize: 'vertical',
                      }}
                    />
                    <Button size="sm" variant="secondary" disabled={bezig || !nieuweOpmerking.trim()} onClick={opslaanOpmerking}>
                      Notitie opslaan
                    </Button>
                  </div>
                )}
              </section>

              {/*
                Accorderen kan nog niet vanuit EVA. Of Bouw7 een stem namens een medewerker
                accepteert vanaf onze API-sleutel is nog niet vastgesteld (fase 0); tot die
                uitkomst er is, wijst het paneel bewust door naar Bouw7 in plaats van een
                knop te tonen die misschien niets doet.
              */}
              {magAccorderen && rij.mijn_beurt && (
                <section style={{
                  padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-soft, transparent)',
                }}>
                  <p style={{ fontSize: 13, margin: '0 0 8px' }}>
                    <strong>Jij bent aan zet.</strong> Accorderen vanuit EVA wordt nu gebouwd;
                    tot die tijd keur je deze factuur goed in Bouw7.
                  </p>
                  <a
                    href={`https://start.bouw7.nl/purchase-invoice#/view/${rij.bouw7_invoice_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm">Openen in Bouw7</Button>
                  </a>
                </section>
              )}
            </DrawerBody>

            <DrawerFooter>
              <div style={{ marginRight: 'auto' }}>
                <Button variant="secondary" size="sm" onClick={() => onFactuurOpenen(rij)}>
                  Factuur bekijken
                </Button>
              </div>
              <Button variant="ghost" size="sm" disabled={bezig} onClick={ververs}>Verversen</Button>
              <Button variant="secondary" size="sm" onClick={onClose}>Sluiten</Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
