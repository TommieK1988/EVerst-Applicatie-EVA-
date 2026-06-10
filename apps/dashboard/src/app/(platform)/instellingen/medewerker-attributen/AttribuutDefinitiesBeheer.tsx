'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerAttribuutDefinitie, AttribuutVeldtype } from '@everts/database/platform-types'
import { upsertAttribuutDefinitie, verwijderAttribuutDefinitie } from '@/app/(platform)/medewerkers/[id]/actions'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  Input,
  Checkbox,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui'

const VELDTYPE_LABELS: Record<AttribuutVeldtype, string> = {
  tekst:   'Tekst',
  datum:   'Datum',
  getal:   'Getal',
  boolean: 'Ja/Nee',
}

type FormState = {
  naam: string
  veldtype: AttribuutVeldtype
  verplicht: boolean
  volgorde: string
  actief: boolean
}

const LEEG: FormState = {
  naam: '',
  veldtype: 'tekst',
  verplicht: false,
  volgorde: '0',
  actief: true,
}

function toForm(d: MedewerkerAttribuutDefinitie): FormState {
  return {
    naam:      d.naam,
    veldtype:  d.veldtype,
    verplicht: d.verplicht,
    volgorde:  String(d.volgorde),
    actief:    d.actief,
  }
}

function DefinitieForm({
  initial,
  existing_id,
  onDone,
}: {
  initial: FormState
  existing_id?: string
  onDone: () => void
}) {
  const [state, setState] = useState<FormState>(initial)
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  function save() {
    startTransition(async () => {
      const result = await upsertAttribuutDefinitie({
        naam:      state.naam,
        veldtype:  state.veldtype,
        verplicht: state.verplicht,
        volgorde:  parseInt(state.volgorde) || 0,
        actief:    state.actief,
      }, existing_id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(existing_id ? 'Definitie bijgewerkt' : 'Definitie toegevoegd')
      onDone()
      window.location.reload()
    })
  }

  return (
    <Card className="mb-2">
      <CardBody>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="block mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">Naam</label>
            <Input
              value={state.naam}
              onChange={e => set('naam', e.target.value)}
              placeholder="bijv. VCA Diploma geldig t/m"
              autoFocus
            />
          </div>
          <div>
            <label className="block mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">Type</label>
            <Select
              value={state.veldtype}
              onValueChange={v => set('veldtype', v as AttribuutVeldtype)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VELDTYPE_LABELS) as AttribuutVeldtype[]).map(t => (
                  <SelectItem key={t} value={t}>{VELDTYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">Volgorde</label>
            <Input
              type="number"
              value={state.volgorde}
              onChange={e => set('volgorde', e.target.value)}
              min={0}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12 }}>
              <Checkbox checked={state.verplicht} onCheckedChange={v => set('verplicht', v === true)} />
              Verplicht
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12 }}>
              <Checkbox checked={state.actief} onCheckedChange={v => set('actief', v === true)} />
              Actief
            </label>
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>Annuleren</Button>
        <Button
          type="button"
          variant="primary"
          onClick={save}
          loading={isPending}
          disabled={isPending || !state.naam.trim()}
        >
          Opslaan
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function AttribuutDefinitiesBeheer({
  initial,
}: {
  initial: MedewerkerAttribuutDefinitie[]
}) {
  const [definities, setDefinities] = useState<MedewerkerAttribuutDefinitie[]>(initial)
  const [showNieuw, setShowNieuw] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDeactiveer(id: string) {
    startTransition(async () => {
      const result = await verwijderAttribuutDefinitie(id)
      if (!result.ok) { toast.error(result.error); return }
      setDefinities(prev => prev.map(d => d.id === id ? { ...d, actief: false } : d))
      toast.success('Attribuut gedeactiveerd')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Attribuutdefinities
        </h2>
        {!showNieuw && (
          <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(true); setEditingId(null) }}>
            + Attribuut toevoegen
          </Button>
        )}
      </div>

      {showNieuw && (
        <DefinitieForm
          initial={LEEG}
          onDone={() => setShowNieuw(false)}
        />
      )}

      {definities.length === 0 && !showNieuw ? (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen attribuutdefinities"
          description='Klik op "+ Attribuut toevoegen" om te beginnen.'
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 60px 60px 60px 100px',
            padding: '4px 14px', gap: 12,
          }}>
            {['Naam', 'Type', 'Volgorde', 'Verplicht', 'Actief', ''].map(h => (
              <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>

          {definities.map(d => (
            <div key={d.id}>
              {editingId === d.id ? (
                <DefinitieForm
                  initial={toForm(d)}
                  existing_id={d.id}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <Card
                  className="overflow-visible"
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 60px 60px 60px 100px',
                    alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    opacity: d.actief ? 1 : 0.5,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{d.naam}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{VELDTYPE_LABELS[d.veldtype]}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{d.volgorde}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{d.verplicht ? 'Ja' : 'Nee'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: d.actief ? 'var(--accent)' : 'var(--fg-muted)' }}>
                    {d.actief ? 'Ja' : 'Nee'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(d.id)}>Bewerken</Button>
                    {d.actief && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeactiveer(d.id)}
                        disabled={isPending}
                      >
                        Deact.
                      </Button>
                    )}
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
