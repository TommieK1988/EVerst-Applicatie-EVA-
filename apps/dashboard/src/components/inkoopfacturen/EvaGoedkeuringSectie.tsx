'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Badge, Button, Combobox, Textarea, type ComboboxOption } from '@/components/ui'
import { Sectie } from '@/components/dossiers/NieuweAanvraagOnderdelen'
import {
  beslisInkoopfactuur, draagInkoopStapOver, getEvaGoedkeuring, stuurInkoopBesluitOpnieuw,
  type EvaGoedkeuring,
} from '@/lib/inkoopfacturen/goedkeuren'
import { zoekMedewerkers } from '@/lib/goedkeuring/medewerkers'
import { STAP_SOORT_LABEL, type GoedkeurStapStatus } from '@/lib/inkoopfacturen/goedkeur-route'

/**
 * De EVA-goedkeuring van één factuur in het zijpaneel: de route, en voor wie aan zet is Akkoord /
 * Bezwaar / Overdragen. Opmaak volgt het venster "Nieuwe aanvraag" (Sectie met gekleurde kop,
 * DS-klassen) — de eerste versie met inline stijlen was op een smal paneel slecht leesbaar.
 */

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

  useEffect(() => { setData(null); setFout(null); setMelding(null); setToelichting(''); setOverdragen(false); laad() }, [laad])

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

  const nogNaarBouw7 = data?.besluit && !data.bouw7BijgewerktOp

  const kiezer = (
    <Combobox
      options={opties}
      onSearch={zoek}
      placeholder="Kies een collega"
      searchPlaceholder="Zoek op naam"
      emptyText="Niemand gevonden"
      onChange={id => { if (id) voerUit(() => draagInkoopStapOver(inkoopfactuurId, id)) }}
      disabled={bezig}
    />
  )

  return (
    <Sectie titel="Goedkeuring" omschrijving="Wie deze factuur goedkeurt, en in welke volgorde" icoon={CheckCircle2}>
      {!data && <p className="text-[13px] text-neutral-500">{fout ?? 'Laden…'}</p>}

      {data && data.stappen.length === 0 && (
        <p className="text-[13px] text-neutral-500">De goedkeurroute wordt bij de volgende synchronisatie bepaald.</p>
      )}

      {data && data.stappen.length > 0 && (
        <ol className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {data.stappen.map(s => {
            const badge = STATUS_BADGE[s.status]
            return (
              <li key={s.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">
                  {s.stap}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-neutral-900">
                    {s.goedkeurder_naam ?? <span className="font-normal italic text-neutral-500">niemand aangewezen — Directie</span>}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {STAP_SOORT_LABEL[s.soort]}{s.soort === 'grootboek' && data.grootboek ? ` · ${data.grootboek}` : ''}
                  </div>
                  {s.beoordeeld_op && (
                    <div className="mt-0.5 text-xs text-neutral-500">{s.beoordeeld_door_naam ?? 'Onbekend'} · {moment(s.beoordeeld_op)}</div>
                  )}
                  {s.toelichting && <p className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-800">{s.toelichting}</p>}
                </div>
                <Badge tone={badge.tone} size="md" className="shrink-0">{badge.label}</Badge>
              </li>
            )
          })}
        </ol>
      )}

      {data?.besluit && data.bouw7BijgewerktOp && (
        <p className="text-xs text-neutral-500">
          Bouw7 bijgewerkt op {moment(data.bouw7BijgewerktOp)}: {data.besluit === 'goedgekeurd' ? 'goedgekeurd' : 'afgekeurd'}, met naam en tijdstip bij de factuur.
        </p>
      )}
      {nogNaarBouw7 && (
        <div className="rounded-lg border border-error-100 bg-error-50 p-3">
          <p className="mb-2 text-[13px] text-error-700">
            <strong>Bouw7 is nog niet bijgewerkt.</strong> {data?.bouw7Fout ?? ''} EVA probeert het bij elke synchronisatie opnieuw.
          </p>
          <Button size="sm" variant="outline" disabled={bezig} onClick={() => voerUit(() => stuurInkoopBesluitOpnieuw(inkoopfactuurId))}>
            Nu opnieuw proberen
          </Button>
        </div>
      )}

      {fout && data && <p className="text-[13px] text-error-700">{fout}</p>}
      {melding && <p className="text-[13px] text-success-700">{melding}</p>}

      {data?.magBeslissen && (
        <div className="flex flex-col gap-3 rounded-lg border border-warning-100 bg-warning-50 p-3">
          <p className="text-[13px] font-semibold text-neutral-900">Jij bent aan zet</p>
          <Textarea
            value={toelichting}
            onChange={e => setToelichting(e.target.value)}
            placeholder="Toelichting (verplicht bij bezwaar) — komt ook bij de factuur in Bouw7"
            rows={2}
            className="bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={bezig} onClick={() => voerUit(() => beslisInkoopfactuur(inkoopfactuurId, 'akkoord', toelichting))}>
              Akkoord
            </Button>
            <Button
              size="sm" variant="outline" disabled={bezig || !toelichting.trim()}
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
          {overdragen && kiezer}
        </div>
      )}

      {/* Niet zelf aan zet, wel bevoegd om de goedkeurder te wijzigen (Directie of de financiële
          administratie): alleen overdragen, geen akkoord namens een ander. */}
      {data && !data.magBeslissen && data.magOverdragen && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] text-neutral-700">Ligt deze factuur bij de verkeerde persoon, of is die afwezig? Leg hem bij iemand anders.</p>
          {!overdragen && (
            <Button size="sm" variant="outline" className="self-start" disabled={bezig} onClick={() => { setOverdragen(true); zoek('') }}>
              Goedkeurder wijzigen
            </Button>
          )}
          {overdragen && kiezer}
        </div>
      )}
    </Sectie>
  )
}
