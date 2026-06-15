'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerBedrijfsmiddel, BedrijfsmiddelType } from '@everts/database/platform-types'
import { upsertBedrijfsmiddel, verwijderBedrijfsmiddel } from '@/app/(platform)/medewerkers/[id]/actions'
import {
  Button,
  Input,
  Badge,
  Checkbox,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Card,
  CardBody,
  EmptyState,
} from '@/components/ui'

const TYPE_LABELS: Record<BedrijfsmiddelType, string> = {
  sleutel:  'Sleutel',
  telefoon: 'Telefoon',
  tankpas:  'Tankpas',
  overig:   'Overig',
}

const TYPE_ICONS: Record<BedrijfsmiddelType, string> = {
  sleutel:  '🔑',
  telefoon: '📱',
  tankpas:  '⛽',
  overig:   '📦',
}

// Type-specifieke velden voor kenmerken JSONB
const KENMERKEN_FIELDS: Record<BedrijfsmiddelType, { key: string; label: string; type?: string }[]> = {
  sleutel:  [{ key: 'sleutelnummer', label: 'Sleutelnummer' }, { key: 'kopienummer', label: 'Kopienummer' }],
  telefoon: [{ key: 'toestel', label: 'Toestel' }, { key: 'imei', label: 'IMEI' }, { key: 'simkaart', label: 'Simkaartnummer' }],
  tankpas:  [{ key: 'kaartnummer', label: 'Kaartnummer' }, { key: 'pin', label: 'PIN-code' }, { key: 'maatschappij', label: 'Maatschappij' }],
  overig:   [{ key: 'omschrijving_extra', label: 'Extra info' }],
}

type ModalState = {
  open: boolean
  existing?: MedewerkerBedrijfsmiddel
}

type FormState = {
  type: BedrijfsmiddelType
  omschrijving: string
  kenmerken: Record<string, string>
  uitgegeven_op: string
  retour_op: string
  actief: boolean
}

const LEEG: FormState = {
  type: 'sleutel',
  omschrijving: '',
  kenmerken: {},
  uitgegeven_op: '',
  retour_op: '',
  actief: true,
}

function toForm(m: MedewerkerBedrijfsmiddel): FormState {
  return {
    type:          m.type,
    omschrijving:  m.omschrijving ?? '',
    kenmerken:     Object.fromEntries(Object.entries(m.kenmerken).map(([k, v]) => [k, String(v ?? '')])),
    uitgegeven_op: m.uitgegeven_op ?? '',
    retour_op:     m.retour_op ?? '',
    actief:        m.actief,
  }
}

function BedrijfsmiddelModal({
  medewerker_id,
  initial,
  existing_id,
  onClose,
  onSaved,
}: {
  medewerker_id: string
  initial: FormState
  existing_id?: string
  onClose: () => void
  onSaved: (middel: MedewerkerBedrijfsmiddel) => void
}) {
  const [state, setState] = useState<FormState>(initial)
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  function setKenmerk(key: string, value: string) {
    setState(prev => ({ ...prev, kenmerken: { ...prev.kenmerken, [key]: value } }))
  }

  function save() {
    startTransition(async () => {
      const payload = {
        ...state,
        omschrijving:  state.omschrijving || null,
        uitgegeven_op: state.uitgegeven_op || null,
        retour_op:     state.retour_op || null,
        kenmerken:     Object.fromEntries(Object.entries(state.kenmerken).filter(([, v]) => v !== '')),
      }
      const result = await upsertBedrijfsmiddel(medewerker_id, payload, existing_id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(existing_id ? 'Bedrijfsmiddel bijgewerkt' : 'Bedrijfsmiddel toegevoegd')
      // Re-fetch happens via revalidatePath; just close
      onClose()
      // Trigger page refresh for server data
      window.location.reload()
    })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 4,
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{existing_id ? 'Bedrijfsmiddel bewerken' : 'Bedrijfsmiddel toevoegen'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <Select
                value={state.type}
                onValueChange={v => set('type', v as BedrijfsmiddelType)}
                disabled={!!existing_id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as BedrijfsmiddelType[]).map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={labelStyle}>Omschrijving</label>
              <Input value={state.omschrijving} onChange={e => set('omschrijving', e.target.value)} placeholder="Optionele toelichting" />
            </div>

            {KENMERKEN_FIELDS[state.type].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <Input
                  type={f.type ?? 'text'}
                  value={state.kenmerken[f.key] ?? ''}
                  onChange={e => setKenmerk(f.key, e.target.value)}
                />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Uitgegeven op</label>
                <Input type="date" value={state.uitgegeven_op} onChange={e => set('uitgegeven_op', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Retour op</label>
                <Input type="date" value={state.retour_op} onChange={e => set('retour_op', e.target.value)} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              <Checkbox checked={state.actief} onCheckedChange={v => set('actief', v === true)} />
              Actief
            </label>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Annuleren</Button>
          <Button type="button" variant="primary" onClick={save} loading={isPending} disabled={isPending}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function BedrijfsmiddelenBeheer({
  medewerker_id,
  initial,
  actief_voertuig,
}: {
  medewerker_id: string
  initial: MedewerkerBedrijfsmiddel[]
  actief_voertuig?: { kenteken: string; merk: string | null; model: string | null; voertuig_id: string } | null
}) {
  const [middelen, setMiddelen] = useState<MedewerkerBedrijfsmiddel[]>(initial)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await verwijderBedrijfsmiddel(id, medewerker_id)
      if (!result.ok) { toast.error(result.error); return }
      setMiddelen(prev => prev.filter(m => m.id !== id))
      toast.success('Verwijderd')
    })
  }

  function formatKenmerken(m: MedewerkerBedrijfsmiddel) {
    const fields = KENMERKEN_FIELDS[m.type]
    return fields
      .map(f => m.kenmerken[f.key] ? `${f.label}: ${m.kenmerken[f.key]}` : null)
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Bedrijfsmiddelen
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setModal({ open: true })}>
          + Toevoegen
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Voertuig (read-only, uit wagenpark) */}
        <Card>
          <CardBody className="flex items-center gap-3 py-2.5">
            <span style={{ fontSize: 18 }}>🚐</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Voertuig</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                {actief_voertuig
                  ? `${actief_voertuig.kenteken}${actief_voertuig.merk ? ` — ${actief_voertuig.merk} ${actief_voertuig.model ?? ''}` : ''}`
                  : 'Geen voertuig gekoppeld'
                }
              </div>
            </div>
            {actief_voertuig && (
              <a
                href={`/wagenpark/voertuigen/${actief_voertuig.voertuig_id}`}
                style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
              >
                Wagenpark →
              </a>
            )}
          </CardBody>
        </Card>

        {/* Overige bedrijfsmiddelen */}
        {middelen.length === 0 ? (
          <EmptyState
            title="Nog geen bedrijfsmiddelen"
            description="Voeg een sleutel, telefoon, tankpas of ander middel toe."
            tone="neutral"
            size="sm"
          />
        ) : (
          middelen.map(m => (
            <Card key={m.id} style={{ opacity: m.actief ? 1 : 0.6 }}>
              <CardBody className="flex items-center gap-3 py-2.5">
                <span style={{ fontSize: 18 }}>{TYPE_ICONS[m.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                    {TYPE_LABELS[m.type]}{m.omschrijving ? ` — ${m.omschrijving}` : ''}
                    {!m.actief && <Badge tone="neutral" size="sm" className="ml-1.5 uppercase">retour</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                    {formatKenmerken(m)}
                    {m.uitgegeven_op && ` · Uit: ${m.uitgegeven_op}`}
                    {m.retour_op && ` · Retour: ${m.retour_op}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ open: true, existing: m })}
                  >
                    Bewerken
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(m.id)}
                    disabled={isPending}
                  >
                    Verwijder
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {modal.open && (
        <BedrijfsmiddelModal
          medewerker_id={medewerker_id}
          initial={modal.existing ? toForm(modal.existing) : LEEG}
          existing_id={modal.existing?.id}
          onClose={() => setModal({ open: false })}
          onSaved={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
