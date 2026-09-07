'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { MedewerkerRooster, MedewerkerRoosterPauze } from '@everts/database/platform-types'
import { upsertRooster, verwijderRooster } from '@/app/(platform)/medewerkers/[id]/actions'
import { Button, Card, CardBody, EmptyState, Input } from '@/components/ui'

const DAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function toMinuten(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

function berekenUrenPerWeek(
  werkdagen: number[],
  dagstart: string,
  dageind: string,
  pauzes: { pauze_start: string; pauze_eind: string }[],
): number {
  if (!werkdagen.length || !dagstart || !dageind) return 0
  const start = toMinuten(dagstart)
  const eind  = toMinuten(dageind)
  if (eind <= start) return 0
  let dagMin = eind - start
  for (const p of pauzes) {
    const ps = toMinuten(p.pauze_start)
    const pe = toMinuten(p.pauze_eind)
    if (pe > ps) dagMin -= (pe - ps)
  }
  if (dagMin < 0) dagMin = 0
  return Math.round((dagMin * werkdagen.length) / 60 * 10) / 10
}

type PauzeInput = { pauze_start: string; pauze_eind: string }

type RoosterInput = {
  geldig_vanaf: string
  geldig_tot: string | null
  werkdagen: number[]
  dagstart: string
  dageind: string
  contracturen_per_week: number | ''
  pauzes: PauzeInput[]
}

const LEEG: RoosterInput = {
  geldig_vanaf: '',
  geldig_tot: null,
  werkdagen: [1, 2, 3, 4, 5],
  dagstart: '07:00',
  dageind: '16:00',
  contracturen_per_week: 40,
  pauzes: [],
}

export type RoosterMetPauzes = MedewerkerRooster & { pauzes: MedewerkerRoosterPauze[] }

function RoosterForm({
  initial,
  medewerker_id,
  existing_id,
  onDone,
}: {
  initial: RoosterInput
  medewerker_id: string
  existing_id?: string
  onDone: () => void
}) {
  const [state, setState] = useState<RoosterInput>(initial)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const set = <K extends keyof RoosterInput>(k: K, v: RoosterInput[K]) =>
    setState(prev => {
      const next = { ...prev, [k]: v }
      if (['dagstart', 'dageind', 'werkdagen', 'pauzes'].includes(k as string)) {
        next.contracturen_per_week = berekenUrenPerWeek(next.werkdagen, next.dagstart, next.dageind, next.pauzes)
      }
      return next
    })

  function toggleDag(dag: number) {
    const days = state.werkdagen.includes(dag)
      ? state.werkdagen.filter(d => d !== dag)
      : [...state.werkdagen, dag].sort()
    set('werkdagen', days)
  }

  function addPauze() {
    set('pauzes', [...state.pauzes, { pauze_start: '12:00', pauze_eind: '12:30' }])
  }

  function setPauze(idx: number, field: keyof PauzeInput, value: string) {
    set('pauzes', state.pauzes.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function removePauze(idx: number) {
    set('pauzes', state.pauzes.filter((_, i) => i !== idx))
  }

  function save() {
    startTransition(async () => {
      const result = await upsertRooster(medewerker_id, state, existing_id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(existing_id ? 'Rooster bijgewerkt' : 'Rooster toegevoegd')
      // Zonder refresh blijft de lijst hangen op de roosters van de laatste
      // paginalading: een net toegevoegd rooster is dan onzichtbaar, en een
      // tweede poging strandt op "overlapt met een bestaand rooster".
      router.refresh()
      onDone()
    })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 5,
  }

  return (
    <Card className="mb-2">
      <CardBody>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 5 }}>Geldig vanaf</label>
          <Input
            type="date"
            value={state.geldig_vanaf}
            onChange={e => set('geldig_vanaf', e.target.value)}
          />
        </div>
        <div>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 5 }}>Geldig tot (leeg = open)</label>
          <Input
            type="date"
            value={state.geldig_tot ?? ''}
            onChange={e => set('geldig_tot', e.target.value || null)}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 6 }}>Werkdagen</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {DAGEN.map((label, i) => {
              const dag = i + 1
              const active = state.werkdagen.includes(dag)
              return (
                <Button
                  key={dag}
                  type="button"
                  variant={active ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => toggleDag(dag)}
                  className="w-[38px]"
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 5 }}>Starttijd</label>
          <Input
            type="time"
            value={state.dagstart}
            onChange={e => set('dagstart', e.target.value)}
          />
        </div>
        <div>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 5 }}>Eindtijd</label>
          <Input
            type="time"
            value={state.dageind}
            onChange={e => set('dageind', e.target.value)}
          />
        </div>

        <div>
          <label className="eva-section-label" style={{ display: 'block', marginBottom: 5 }}>Contracturen per week</label>
          <Input
            type="number"
            min={0} max={80} step={0.5}
            value={state.contracturen_per_week}
            onChange={e => set('contracturen_per_week', e.target.value === '' ? '' : parseFloat(e.target.value))}
          />
        </div>

        {/* Pauzeblokken */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>Pauzes</label>
            <Button type="button" variant="ghost" size="sm" onClick={addPauze}>
              + Pauze toevoegen
            </Button>
          </div>
          {state.pauzes.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>Geen pauzes ingesteld.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.pauzes.map((p, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>Van</label>
                    <Input type="time" value={p.pauze_start} onChange={e => setPauze(idx, 'pauze_start', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tot</label>
                    <Input type="time" value={p.pauze_eind} onChange={e => setPauze(idx, 'pauze_eind', e.target.value)} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-md"
                    onClick={() => removePauze(idx)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>Annuleren</Button>
          <Button
            type="button"
            variant="primary"
            onClick={save}
            loading={isPending}
            disabled={isPending || !state.geldig_vanaf || state.werkdagen.length === 0}
          >
            Opslaan
          </Button>
        </div>
      </div>
      </CardBody>
    </Card>
  )
}

function formatWerkdagen(days: number[]) {
  return days.map(d => DAGEN[d - 1]).join(', ')
}

function formatPauzes(pauzes: MedewerkerRoosterPauze[]) {
  if (!pauzes.length) return null
  return pauzes.map(p => `${p.pauze_start.slice(0, 5)}–${p.pauze_eind.slice(0, 5)}`).join(', ')
}

export default function RoosterBeheer({
  medewerker_id,
  initial,
}: {
  medewerker_id: string
  initial: RoosterMetPauzes[]
}) {
  const [roosters, setRoosters] = useState<RoosterMetPauzes[]>(initial)
  // De serveractie draait revalidatePath, dus na opslaan/verwijderen komt er een
  // verse `initial` binnen. useState negeert latere props — daarom hier expliciet
  // meelopen, anders toont de kaart verouderde (of lege) roosters.
  useEffect(() => { setRoosters(initial) }, [initial])
  const [showNieuw, setShowNieuw] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await verwijderRooster(id, medewerker_id)
      if (!result.ok) { toast.error(result.error); return }
      setRoosters(prev => prev.filter(r => r.id !== id))
      toast.success('Rooster verwijderd')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Werkrooster
        </h3>
        {!showNieuw && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowNieuw(true); setEditingId(null) }}
          >
            + Rooster toevoegen
          </Button>
        )}
      </div>

      {showNieuw && (
        <RoosterForm
          initial={LEEG}
          medewerker_id={medewerker_id}
          onDone={() => setShowNieuw(false)}
        />
      )}

      {roosters.length === 0 && !showNieuw ? (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen rooster ingesteld"
          description="Voeg een rooster toe om capaciteit te berekenen."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {roosters.map(r => (
            <div key={r.id}>
              {editingId === r.id ? (
                <RoosterForm
                  initial={{
                    geldig_vanaf: r.geldig_vanaf,
                    geldig_tot: r.geldig_tot,
                    werkdagen: r.werkdagen,
                    dagstart: r.dagstart,
                    dageind: r.dageind,
                    contracturen_per_week: r.contracturen_per_week,
                    pauzes: (r.pauzes ?? []).map(p => ({ pauze_start: p.pauze_start.slice(0, 5), pauze_eind: p.pauze_eind.slice(0, 5) })),
                  }}
                  medewerker_id={medewerker_id}
                  existing_id={r.id}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <Card>
                  <CardBody className="flex items-center gap-3 py-2.5">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                        {r.geldig_vanaf} → {r.geldig_tot ?? 'open'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {formatWerkdagen(r.werkdagen)} · {r.dagstart.slice(0,5)}–{r.dageind.slice(0,5)} · {r.contracturen_per_week}u/week
                        {formatPauzes(r.pauzes ?? []) && ` · Pauze: ${formatPauzes(r.pauzes ?? [])}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(r.id)}>
                        Bewerken
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(r.id)}
                        disabled={isPending}
                      >
                        Verwijder
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
