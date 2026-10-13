'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Combobox, Textarea, type ComboboxOption } from '@/components/ui'
import {
  beslisInkoopfactuur, draagInkoopStapOver, getEvaGoedkeuring, stuurInkoopBesluitOpnieuw,
  type EvaGoedkeuring,
} from '@/lib/inkoopfacturen/goedkeuren'
import { zoekMedewerkers } from '@/lib/goedkeuring/medewerkers'
import { STAP_SOORT_LABEL, type GoedkeurStapStatus } from '@/lib/inkoopfacturen/goedkeur-route'

const STATUS_BADGE: Record<GoedkeurStapStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'error' }> = {
  wacht:     { label: 'Volgt',     tone: 'neutral' },
  open:      { label: 'Aan zet',   tone: 'warning' },
  akkoord:   { label: 'Akkoord',   tone: 'success' },
  bezwaar:   { label: 'Bezwaar',   tone: 'error' },
  vervallen: { label: 'Vervallen', tone: 'neutral' },
}

function moment(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

const kop: React.CSSProperties = {
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-soft)', margin: '0 0 8px',
}

type Props = {
  inkoopfactuurId: string
  /** Na een besluit of overdracht: lijst en paneel verversen. */
  onGewijzigd: () => void
}

export default function EvaGoedkeuringSectie({ inkoopfactuurId, onGewijzigd }: Props) {
  const [data, setData] = useState<EvaGoedkeuring | null>(null)
  const [toelichting, setToelichting] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [overdragen, setOverdragen] = useState(false)
  const [opties, setOpties] = useState<ComboboxOption[]>([])

  const laad = useCallback(async () => {
    try { setData(await getEvaGoedkeuring(inkoopfactuurId)) } catch (e) {
      setFout(e instanceof Error ? e.message : 'Laden mislukt')
    }
  }, [inkoopfactuurId])

  useEffect(() => { setData(null); setFout(null); setMelding(null); setToelichting(''); laad() }, [laad])

  async function zoek(term: string) {
    const lijst = await zoekMedewerkers(term)
    setOpties(lijst.map(m => ({ value: m.id, label: m.naam, sub: m.afdeling ?? undefined })))
  }

  async function voerUit(actie: () => Promise<{ ok: true; melding?: string } | { ok: false; error: string }>) {
    setBezig(true); setFout(null); setMelding(null)
    const res = await actie()
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setMelding(res.melding ?? null)
    setToelichting(''); setOverdragen(false)
    await laad()
    onGewijzigd()
  }

  if (!data) return <p style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{fout ?? 'Laden…'}</p>

  const nogNaarBouw7 = data.besluit && !data.bouw7BijgewerktOp

  return (
    <section style={{ marginBottom: 20 }}>
      <h4 style={kop}>Goedkeuring in EVA</h4>

      {data.stappen.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0 }}>De goedkeurroute wordt bij de volgende sync bepaald.</p>
      )}
      {data.stappen.map(s => {
        const badge = STATUS_BADGE[s.status]
        return (
          <div key={s.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {s.stap}. {s.goedkeurder_naam ?? <em style={{ fontWeight: 400 }}>niemand aangewezen — Directie</em>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                {STAP_SOORT_LABEL[s.soort]}{s.soort === 'grootboek' && data.grootboek ? ` ${data.grootboek}` : ''}
              </span>
              <Badge tone={badge.tone} size="sm" style={{ marginLeft: 'auto' }}>{badge.label}</Badge>
            </div>
            {s.beoordeeld_op && (
              <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 2 }}>
                {s.beoordeeld_door_naam ?? 'Onbekend'} · {moment(s.beoordeeld_op)}
              </div>
            )}
            {s.toelichting && <p style={{ fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{s.toelichting}</p>}
          </div>
        )
      })}

      {data.besluit && data.bouw7BijgewerktOp && (
        <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: '8px 0 0' }}>
          Bouw7 bijgewerkt op {moment(data.bouw7BijgewerktOp)}: status {data.besluit === 'goedgekeurd' ? 'goedgekeurd' : 'afgekeurd'}, met naam en tijdstip bij de factuur.
        </p>
      )}
      {nogNaarBouw7 && (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, margin: '0 0 8px' }}>
            <strong>Bouw7 is nog niet bijgewerkt.</strong> {data.bouw7Fout ?? ''} EVA probeert het bij elke sync opnieuw.
          </p>
          <Button size="sm" variant="secondary" disabled={bezig} onClick={() => voerUit(() => stuurInkoopBesluitOpnieuw(inkoopfactuurId))}>
            Nu opnieuw proberen
          </Button>
        </div>
      )}

      {fout && <p style={{ fontSize: 13, color: '#dc2626', margin: '8px 0 0' }}>{fout}</p>}
      {melding && <p style={{ fontSize: 13, color: '#0f766e', margin: '8px 0 0' }}>{melding}</p>}

      {data.magBeslissen && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, margin: '0 0 8px' }}><strong>Jij bent aan zet.</strong></p>
          <Textarea
            value={toelichting}
            onChange={e => setToelichting(e.target.value)}
            placeholder="Toelichting (verplicht bij bezwaar) — komt ook bij de factuur in Bouw7"
            rows={2}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button size="sm" disabled={bezig} onClick={() => voerUit(() => beslisInkoopfactuur(inkoopfactuurId, 'akkoord', toelichting))}>
              Akkoord
            </Button>
            <Button
              size="sm" variant="secondary" disabled={bezig || !toelichting.trim()}
              title={toelichting.trim() ? undefined : 'Geef eerst een reden'}
              onClick={() => voerUit(() => beslisInkoopfactuur(inkoopfactuurId, 'bezwaar', toelichting))}
            >
              Bezwaar
            </Button>
            {data.magOverdragen && !overdragen && (
              <Button size="sm" variant="ghost" disabled={bezig} onClick={() => { setOverdragen(true); zoek('') }}>
                Overdragen
              </Button>
            )}
          </div>
          {overdragen && (
            <div style={{ marginTop: 8 }}>
              <Combobox
                options={opties}
                onSearch={zoek}
                placeholder="Kies een collega"
                searchPlaceholder="Zoek op naam"
                emptyText="Niemand gevonden"
                onChange={id => { if (id) voerUit(() => draagInkoopStapOver(inkoopfactuurId, id)) }}
                disabled={bezig}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
