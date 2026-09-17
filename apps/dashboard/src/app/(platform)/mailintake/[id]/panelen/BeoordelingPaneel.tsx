'use client'

/**
 * De rechterkolom van het behandelscherm: waarop berust het voorstel?
 *
 * Drie blokken: wat EVA ervan maakte, hoe de opdrachtgever herkend is, en welke
 * bestaande dossiers erop lijken. Apart bestand omdat het behandelscherm anders
 * over de 800 regels gaat, en omdat dit blok niets van het formulier hoeft te weten
 * -- het leest alleen.
 */

import React, { useState } from 'react'

import { Button, Badge, Card } from '@/components/ui'
import { dossierHref } from '@/lib/dossiers/href'
import { zoekDossierVoorIntake } from '@/lib/mailintake/actions'
import {
  MAIL_SOORT_LABELS, HERKEND_VIA_LABELS, DUPLICAAT_HARD,
} from '@/lib/mailintake/types'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
const kop = { fontSize: 13, fontWeight: 600, marginBottom: 6 } as const

const veldStijl: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

type Gevonden = Awaited<ReturnType<typeof zoekDossierVoorIntake>>[number]

/**
 * Zelf een dossier opzoeken om aan te koppelen.
 *
 * Staat in de rechterkolom en dus op élke route: ook een aanvraag of een
 * regie-opdracht kan bij werk horen dat al in EVA staat. Zoekt op dossier- en
 * offertenummer, op titel en op werkadres -- dat nummer is het punt, want wie het
 * offertenummer uit de mail overtikte vond daarvoor niets.
 */
function DossierZoeker({
  bewerkbaar, bezig, onKoppel,
}: {
  bewerkbaar: boolean
  bezig: boolean
  onKoppel: (dossierId: string, soort: KoppelSoort, label: string) => void
}) {
  const [term, setTerm] = useState('')
  const [zoekt, setZoekt] = useState(false)
  const [gevonden, setGevonden] = useState<Gevonden[] | null>(null)

  async function zoeken() {
    if (term.trim().length < 2) return
    setZoekt(true)
    try {
      setGevonden(await zoekDossierVoorIntake(term))
    } finally {
      setZoekt(false)
    }
  }

  if (!bewerkbaar) return null

  return (
    <Card style={{ padding: 14 }}>
      <div style={kop}>Koppelen aan een bestaand dossier</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ ...veldStijl, flex: 1 }}
          placeholder="Offertenummer, titel of adres…"
          value={term}
          onChange={e => setTerm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void zoeken() } }}
        />
        <Button variant="outline" onClick={() => void zoeken()} disabled={zoekt}>
          {zoekt ? '…' : 'Zoeken'}
        </Button>
      </div>

      {gevonden != null && gevonden.length === 0 && (
        <p style={{ ...klein, marginTop: 8 }}>Niets gevonden op “{term}”.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {(gevonden ?? []).map(d => (
          <div key={d.dossierId} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13 }}>
              <strong>{d.dossiernummer ?? 'zonder nummer'}</strong>
              {d.hoofdstatus && (
                <span style={klein}> · {d.hoofdstatus}{d.substatus ? ` / ${d.substatus}` : ''}</span>
              )}
            </div>
            <div style={zacht}>{d.titel}</div>
            {(d.klantnaam || d.werkadres) && (
              <div style={klein}>{[d.klantnaam, d.werkadres].filter(Boolean).join(' · ')}</div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <a href={dossierHref(d.dossierId, d.hoofdstatus)} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 12, color: 'hsl(var(--primary))' }}>
                Bekijk dossier
              </a>
              <Button
                variant="ghost" disabled={bezig}
                onClick={() => onKoppel(d.dossierId, 'gekoppeld_bestaand', 'Koppelen aan dit dossier')}
              >
                Koppelen
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

type KoppelSoort = 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen'

export default function BeoordelingPaneel({
  bericht: b, toelichting, duplicaten, bewerkbaar, bezig, onKoppel,
  objectTreffer, objectId, setObjectId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bericht: any
  toelichting: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  duplicaten: any[]
  bewerkbaar: boolean
  bezig: boolean
  onKoppel: (dossierId: string, soort: KoppelSoort, label: string) => void
  /** De objecttreffer op het werkadres; het koppelen gebeurt hier. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  objectTreffer: any
  objectId: string | null
  setObjectId: (id: string | null) => void
}) {
  return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <div style={kop}>Beoordeling</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            {b.soort ? MAIL_SOORT_LABELS[b.soort as keyof typeof MAIL_SOORT_LABELS] : 'Nog niet beoordeeld'}
            {b.soort_vertrouwen != null && (
              <span style={klein}> · {Math.round(Number(b.soort_vertrouwen) * 100)}% zeker</span>
            )}
          </div>
          {b.samenvatting && <p style={zacht}>{b.samenvatting}</p>}
          {toelichting && (
            <p style={{ ...klein, marginTop: 6 }}>{toelichting}</p>
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          <div style={kop}>Herkenning</div>
          {b.relatie ? (
            <p style={zacht}>
              Herkend via {b.herkend_via ? HERKEND_VIA_LABELS[b.herkend_via as keyof typeof HERKEND_VIA_LABELS] : 'onbekend'} →{' '}
              <strong>{b.relatie.naam}</strong>
              {b.herkenning_score != null && <span style={klein}> ({Math.round(Number(b.herkenning_score) * 100)}%)</span>}
            </p>
          ) : (
            <p style={{ ...zacht, color: 'var(--wa-800, #92400e)' }}>
              De afzender is niet herkend als bestaande klant. Kies zelf de opdrachtgever, of maak er een nieuwe aan
              via Relaties.
            </p>
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          <div style={kop}>Object</div>
          {objectTreffer?.kandidaten?.length ? (
            <>
              <p style={{ ...zacht, marginBottom: 8 }}>{objectTreffer.toelichting}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {objectTreffer.kandidaten.map((k: { id: string; naam: string | null; score: number; adres?: string | null }) => (
                  <label key={k.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <input
                      type="radio"
                      name="object"
                      checked={objectId === k.id}
                      disabled={!bewerkbaar}
                      onChange={() => setObjectId(k.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontWeight: objectId === k.id ? 600 : 400 }}>{k.naam}</span>
                      <span style={klein}> · {Math.round(k.score * 100)}%</span>
                      <br />
                      <span style={klein}>{k.adres}</span>
                    </span>
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="radio" name="object" checked={objectId === null}
                    disabled={!bewerkbaar} onChange={() => setObjectId(null)}
                  />
                  <span style={klein}>Geen object koppelen</span>
                </label>
              </div>
            </>
          ) : (
            <p style={klein}>
              Geen object gevonden op dit adres. Het dossier wordt dan zonder objectkoppeling
              aangemaakt; dat kan later alsnog vanuit het dossier.
            </p>
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          <div style={kop}>Mogelijke duplicaten</div>
          {duplicaten.length === 0 ? (
            <p style={klein}>Geen vergelijkbaar dossier gevonden.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {duplicaten.map(d => (
                <div key={d.id} style={{
                  padding: 8, borderRadius: 6,
                  border: `1px solid ${d.score >= DUPLICAAT_HARD ? 'var(--da-300, #fca5a5)' : 'var(--border)'}`,
                  background: d.score >= DUPLICAAT_HARD ? 'var(--da-50, #fef2f2)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>{d.dossiernummer ?? 'dossier'}</strong>
                    <Badge tone={d.score >= DUPLICAAT_HARD ? 'error' : 'warning'}>
                      {Math.round(d.score * 100)}%
                    </Badge>
                  </div>
                  <div style={zacht}>{d.titel}</div>
                  {d.klantnaam && <div style={klein}>{d.klantnaam}</div>}
                  <ul style={{ ...klein, margin: '4px 0 0', paddingLeft: 16 }}>
                    {d.redenen.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <a href={dossierHref(d.dossierId, d.hoofdstatus)} target="_blank" rel="noopener noreferrer"
                       style={{ fontSize: 12, color: 'hsl(var(--primary))' }}>
                      Bekijk dossier
                    </a>
                    {bewerkbaar && (
                      <>
                        <Button variant="ghost" onClick={() => onKoppel(d.dossierId, 'gekoppeld_bestaand', 'Koppelen aan dit dossier')} disabled={bezig}>
                          Koppelen
                        </Button>
                        {d.soort === 'offerte_match' && (
                          <Button variant="ghost" onClick={() => onKoppel(d.dossierId, 'offerte_gewonnen', 'Hoort bij deze offerte')} disabled={bezig}>
                            Hoort bij deze offerte
                          </Button>
                        )}
                        {d.soort === 'meerwerk_kandidaat' && (
                          <Button variant="ghost" onClick={() => onKoppel(d.dossierId, 'meerwerk', 'Meerwerk op dit dossier')} disabled={bezig}>
                            Meerwerk
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <DossierZoeker bewerkbaar={bewerkbaar} bezig={bezig} onKoppel={onKoppel} />
      </div>
  )
}
