'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dialog, DialogContent, DialogTitle, Textarea } from '@/components/ui'
import { beslisInkoopfactuur, getEvaGoedkeuring, type EvaGoedkeuring } from '@/lib/inkoopfacturen/goedkeuren'
import { getInkoopfactuurDetail, plaatsInkoopfactuurOpmerking, type OpmerkingRij } from '@/lib/inkoopfacturen/actions'
import { STAP_SOORT_LABEL } from '@/lib/inkoopfacturen/goedkeur-route'
import { dossierHref, type InkoopfactuurRij } from '@/lib/inkoopfacturen/types'
import { CheckCircle2, FileText, MessageSquare, Tag } from 'lucide-react'
import { Sectie } from '@/components/dossiers/NieuweAanvraagOnderdelen'
import BewakingscodeKiezer from './BewakingscodeKiezer'
import Veld from './Veld'

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
  /** Bij welke factuur het scherm opent (klik in de lijst); leeg = de eerste. */
  startId?: string | null
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

export default function GoedkeurModus({ open, stapel, startId, onClose, onGewijzigd }: Props) {
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
    if (open) {
      setLijst(stapel)
      setIndex(Math.max(0, startId ? stapel.findIndex(r => r.id === startId) : 0))
      setAfgehandeld(0); setMelding(null)
    }
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

              <div className="overflow-y-auto border-l border-neutral-200 bg-neutral-50 p-4">
                <Sectie titel="Factuur" omschrijving="Zoals de leverancier hem stuurde" icoon={FileText}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Veld label="Leverancier" breed>{rij.leverancier_naam ?? '—'}</Veld>
                    <Veld label="Factuurnummer">{rij.factuurnummer ?? '—'}</Veld>
                    <Veld label="Administratie">{rij.divisie_naam ?? '—'}</Veld>
                    <Veld label="Bedrag excl.">{euro(rij.bedrag_excl)}</Veld>
                    <Veld label="Btw">{euro(rij.btw_bedrag)}</Veld>
                    <Veld label="Bedrag incl."><strong>{euro(rij.bedrag_incl)}</strong></Veld>
                    <Veld label="Vervaldatum">{datum(rij.vervaldatum)}</Veld>
                    {rij.bouw7_opmerking && <Veld label="Omschrijving" breed>{rij.bouw7_opmerking}</Veld>}
                  </div>
                </Sectie>

                <Sectie titel="Kosten" omschrijving="Waar deze factuur op geboekt staat" icoon={Tag}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Veld label="Project" breed>
                      {rij.bouw7_project_id == null ? <span className="italic text-neutral-500">geen project (overhead)</span>
                        : href ? <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{[rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ') || 'Naar het dossier'}</a>
                        : [rij.project_nummer, rij.project_naam].filter(Boolean).join(' · ')}
                    </Veld>
                    <Veld label="Bewakingscode" breed>
                      {rij.bewakingscode ? <><strong>{rij.bewakingscode}</strong>{rij.bewakingscode_naam ? ` · ${rij.bewakingscode_naam}` : ''}</> : '—'}
                    </Veld>
                  </div>
                  {rij.bouw7_project_id != null && (
                    <BewakingscodeKiezer inkoopfactuurId={rij.id} onGewijzigd={nieuw => {
                      setLijst(l => l.map(x => (x.id === rij.id ? { ...x, bewakingscode: nieuw.code, bewakingscode_naam: nieuw.naam } : x)))
                      onGewijzigd()
                    }} />
                  )}
                </Sectie>

                <Sectie titel="Route" omschrijving="Wie deze factuur goedkeurt" icoon={CheckCircle2}>
                  {!route && !fout && <p className="text-[13px] text-neutral-500">Laden…</p>}
                  {route && (
                    <ol className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                      {route.stappen.map(s => (
                        <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">{s.stap}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-neutral-900">{s.goedkeurder_naam ?? 'Directie'}</div>
                            <div className="text-xs text-neutral-500">
                              {STAP_SOORT_LABEL[s.soort]}{s.soort === 'grootboek' && route.grootboek ? ` · ${route.grootboek}` : ''}
                            </div>
                          </div>
                          <Badge size="md" className="shrink-0" tone={s.status === 'open' ? 'warning' : s.status === 'akkoord' ? 'success' : s.status === 'bezwaar' ? 'error' : 'neutral'}>
                            {s.status === 'open' ? 'Aan zet' : s.status === 'akkoord' ? 'Akkoord' : s.status === 'bezwaar' ? 'Bezwaar' : s.status === 'wacht' ? 'Volgt' : 'Vervallen'}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </Sectie>

                <Sectie titel="Notities" omschrijving="Blijven in EVA; komen niet in Bouw7" icoon={MessageSquare}>
                  {notities.length === 0 && <p className="text-[13px] text-neutral-500">Nog geen notities.</p>}
                  {notities.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {notities.map(o => (
                        <li key={o.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                          <div className="text-xs text-neutral-500"><strong className="text-neutral-700">{o.medewerker_naam ?? 'Onbekend'}</strong> · {new Date(o.created_at).toLocaleString('nl-NL')}</div>
                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-neutral-900">{o.tekst}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Textarea value={notitie} onChange={e => setNotitie(e.target.value)} rows={2} placeholder="Notitie bij deze factuur" />
                  <Button size="sm" variant="outline" className="self-start" disabled={bezig || !notitie.trim()} onClick={bewaarNotitie}>Notitie opslaan</Button>
                </Sectie>
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
                <Button variant="outline" size="sm" disabled={bezig || !route?.magBeslissen || !toelichting.trim()}
                  title={toelichting.trim() ? undefined : 'Geef eerst een reden'} onClick={() => beslis('bezwaar')}>Bezwaar</Button>
                <Button size="sm" variant="primary" disabled={bezig || !route?.magBeslissen} onClick={() => beslis('akkoord')}>Akkoord</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
