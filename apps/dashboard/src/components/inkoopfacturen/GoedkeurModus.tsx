'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dialog, DialogContent, DialogTitle, Textarea } from '@/components/ui'
import { beslisInkoopfactuur, getEvaGoedkeuring, type EvaGoedkeuring } from '@/lib/inkoopfacturen/goedkeuren'
import { getInkoopfactuurDetail, plaatsInkoopfactuurOpmerking, type OpmerkingRij } from '@/lib/inkoopfacturen/actions'
import { STAP_SOORT_LABEL } from '@/lib/inkoopfacturen/goedkeur-route'
import { dossierHref, type InkoopfactuurRij } from '@/lib/inkoopfacturen/types'
import BewakingscodeKiezer from './BewakingscodeKiezer'

/**
 * Goedkeuren als werkstapel: de facturen komen één voor één voorbij, met links het document en
 * rechts wat je nodig hebt om te beslissen. Na Akkoord of Bezwaar opent meteen de volgende.
 *
 * De stapel is een momentopname bij het openen. Een factuur die je hebt afgehandeld verdwijnt
 * eruit; Overslaan laat hem staan voor straks. Bewerken kan alleen wat de boeking niet raakt:
 * de bewakingscode (via de leverbon) en notities. Bedragen, btw en factuurnummer zijn van de
 * leverancier — klopt daar iets niet, dan is dat een Bezwaar met de reden erbij.
 */

type Props = {
  open: boolean
  stapel: InkoopfactuurRij[]
  onClose: () => void
  /** Na elk besluit of elke wijziging: de lijst eronder opnieuw laden. */
  onGewijzigd: () => void
}

function euro(n: number | null): string {
  return n == null ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const kop: React.CSSProperties = {
  fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-soft)', margin: '16px 0 6px', fontWeight: 600,
}

function Regel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '2px 0' }}>
      <span style={{ width: 112, flexShrink: 0, color: 'var(--fg-soft)' }}>{label}</span>
      <span style={{ color: 'var(--fg)', minWidth: 0 }}>{children}</span>
    </div>
  )
}

export default function GoedkeurModus({ open, stapel, onClose, onGewijzigd }: Props) {
  const [lijst, setLijst] = useState<InkoopfactuurRij[]>([])
  const [index, setIndex] = useState(0)
  const [route, setRoute] = useState<EvaGoedkeuring | null>(null)
  const [notities, setNotities] = useState<OpmerkingRij[]>([])
  const [toelichting, setToelichting] = useState('')
  const [notitie, setNotitie] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [afgehandeld, setAfgehandeld] = useState(0)

  // Momentopname bij openen: een refresh van de lijst eronder mag de stapel niet laten verspringen.
  useEffect(() => {
    if (open) { setLijst(stapel); setIndex(0); setAfgehandeld(0); setMelding(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const rij = lijst[index] ?? null

  const laad = useCallback(async (id: string) => {
    setRoute(null); setNotities([]); setFout(null)
    try {
      const [r, d] = await Promise.all([getEvaGoedkeuring(id), getInkoopfactuurDetail(id)])
      setRoute(r); setNotities(d.opmerkingen)
    } catch (e) { setFout(e instanceof Error ? e.message : 'Laden mislukt') }
  }, [])

  useEffect(() => { if (rij) { setToelichting(''); setNotitie(''); laad(rij.id) } }, [rij, laad])

  async function beslis(keuze: 'akkoord' | 'bezwaar') {
    if (!rij) return
    setBezig(true); setFout(null); setMelding(null)
    const res = await beslisInkoopfactuur(rij.id, keuze, toelichting)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setMelding(res.melding ?? null)
    setAfgehandeld(n => n + 1)
    // Uit de stapel; de index blijft staan en wijst dan vanzelf naar de volgende.
    setLijst(l => l.filter(x => x.id !== rij.id))
    setIndex(i => Math.min(i, Math.max(0, lijst.length - 2)))
    onGewijzigd()
  }

  async function bewaarNotitie() {
    if (!rij || !notitie.trim()) return
    setBezig(true)
    const res = await plaatsInkoopfactuurOpmerking(rij.id, notitie)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setNotitie('')
    setNotities((await getInkoopfactuurDetail(rij.id)).opmerkingen)
  }

  const open_stap = useMemo(() => route?.stappen.find(s => s.status === 'open') ?? null, [route])
  const href = rij ? dossierHref(rij) : null

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !bezig) onClose() }}>
      <DialogContent size="xl" style={{ maxWidth: 'min(1400px, 96vw)', width: '96vw', height: '92vh', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <DialogTitle style={{ fontSize: 15, margin: 0 }}>Facturen goedkeuren</DialogTitle>
          <span style={{ fontSize: 12.5, color: 'var(--fg-soft)' }}>
            {lijst.length ? `${index + 1} van ${lijst.length}` : 'Klaar'}{afgehandeld ? ` · ${afgehandeld} afgehandeld` : ''}
          </span>
          {melding && <span style={{ fontSize: 12.5, color: '#0f766e', marginLeft: 8 }}>{melding}</span>}
        </div>

        {!rij && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>Alles afgehandeld</p>
              <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: '0 0 16px' }}>Er liggen geen facturen meer bij jou in deze stapel.</p>
              <Button size="sm" onClick={onClose}>Sluiten</Button>
            </div>
          </div>
        )}

        {rij && (
          <>
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)' }}>
              <div style={{ background: 'var(--bg-soft, #f4f4f5)', minHeight: 0 }}>
                <iframe key={rij.id} src={`/api/inkoopfacturen/${rij.id}/document`} title={`Factuur ${rij.factuurnummer ?? rij.id}`}
                  style={{ width: '100%', height: '100%', border: 0 }} />
              </div>

              <div style={{ overflowY: 'auto', padding: '4px 16px 16px', borderLeft: '1px solid var(--border)' }}>
                <h4 style={kop}>Factuur</h4>
                <Regel label="Leverancier">{rij.leverancier_naam ?? '—'}</Regel>
                <Regel label="Factuurnummer">{rij.factuurnummer ?? '—'}</Regel>
                <Regel label="Bedrag excl.">{euro(rij.bedrag_excl)}</Regel>
                <Regel label="Btw">{euro(rij.btw_bedrag)}</Regel>
                <Regel label="Bedrag incl."><strong>{euro(rij.bedrag_incl)}</strong></Regel>
                <Regel label="Factuurdatum">{datum(rij.factuurdatum)}</Regel>
                <Regel label="Vervaldatum">{datum(rij.vervaldatum)}</Regel>
                <Regel label="Administratie">{rij.divisie_naam ?? '—'}</Regel>
                <Regel label="Project">
                  {rij.bouw7_project_id == null ? <em style={{ color: 'var(--fg-soft)' }}>geen project (overhead)</em>
                    : href ? <a href={href} target="_blank" rel="noreferrer">{[rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ')}</a>
                    : [rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ')}
                </Regel>
                {rij.bouw7_opmerking && <Regel label="Opmerking">{rij.bouw7_opmerking}</Regel>}

                <h4 style={kop}>Bewakingscode</h4>
                <p style={{ fontSize: 13, margin: '0 0 6px' }}>
                  {rij.bewakingscode ? <><strong>{rij.bewakingscode}</strong>{rij.bewakingscode_naam ? ` · ${rij.bewakingscode_naam}` : ''}</> : <span style={{ color: 'var(--fg-soft)' }}>Geen</span>}
                </p>
                <BewakingscodeKiezer inkoopfactuurId={rij.id} onGewijzigd={nieuw => {
                  setLijst(l => l.map(x => (x.id === rij.id ? { ...x, bewakingscode: nieuw.code, bewakingscode_naam: nieuw.naam } : x)))
                  onGewijzigd()
                }} />

                <h4 style={kop}>Route</h4>
                {!route && !fout && <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0 }}>Laden…</p>}
                {route?.stappen.map(s => (
                  <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                    <span>{s.stap}. {s.goedkeurder_naam ?? 'Directie'}</span>
                    <span style={{ color: 'var(--fg-soft)', fontSize: 12 }}>
                      {STAP_SOORT_LABEL[s.soort]}{s.soort === 'grootboek' && route.grootboek ? ` ${route.grootboek}` : ''}
                    </span>
                    <Badge size="sm" tone={s.status === 'open' ? 'warning' : s.status === 'akkoord' ? 'success' : s.status === 'bezwaar' ? 'error' : 'neutral'} style={{ marginLeft: 'auto' }}>
                      {s.status === 'open' ? 'Aan zet' : s.status === 'akkoord' ? 'Akkoord' : s.status === 'bezwaar' ? 'Bezwaar' : s.status === 'wacht' ? 'Volgt' : 'Vervallen'}
                    </Badge>
                  </div>
                ))}

                <h4 style={kop}>Notities in EVA</h4>
                {notities.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: '0 0 6px' }}>Nog geen notities.</p>}
                {notities.map(o => (
                  <div key={o.id} style={{ padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{o.medewerker_naam ?? 'Onbekend'} · {new Date(o.created_at).toLocaleString('nl-NL')}</div>
                    <p style={{ fontSize: 13, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{o.tekst}</p>
                  </div>
                ))}
                <Textarea value={notitie} onChange={e => setNotitie(e.target.value)} rows={2} placeholder="Notitie bij deze factuur (blijft in EVA)" />
                <div style={{ marginTop: 6 }}>
                  <Button size="sm" variant="secondary" disabled={bezig || !notitie.trim()} onClick={bewaarNotitie}>Notitie opslaan</Button>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <Textarea value={toelichting} onChange={e => setToelichting(e.target.value)} rows={2}
                  placeholder="Toelichting bij je besluit (verplicht bij bezwaar) — komt ook bij de factuur in Bouw7" />
                {fout && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '4px 0 0' }}>{fout}</p>}
                {route && !route.magBeslissen && (
                  <p style={{ fontSize: 12.5, color: 'var(--fg-soft)', margin: '4px 0 0' }}>
                    {route.besluit ? 'Over deze factuur is al besloten.' : `Deze factuur ligt bij ${open_stap?.goedkeurder_naam ?? 'iemand anders'}.`}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" disabled={bezig || index === 0} onClick={() => setIndex(i => i - 1)}>Vorige</Button>
                <Button variant="ghost" size="sm" disabled={bezig || index >= lijst.length - 1} onClick={() => setIndex(i => i + 1)}>Overslaan</Button>
                <Button variant="secondary" size="sm" disabled={bezig || !route?.magBeslissen || !toelichting.trim()}
                  title={toelichting.trim() ? undefined : 'Geef eerst een reden'} onClick={() => beslis('bezwaar')}>Bezwaar</Button>
                <Button size="sm" disabled={bezig || !route?.magBeslissen} onClick={() => beslis('akkoord')}>Akkoord</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
