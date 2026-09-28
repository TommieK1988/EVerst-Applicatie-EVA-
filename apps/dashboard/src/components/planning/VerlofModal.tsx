'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { Medewerker, MedewerkerAfwezigheid, MedewerkerAfwezigheidType } from '@everts/database/platform-types'
import { medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import { maakAfwezigheid, wijzigAfwezigheid, verwijderAfwezigheid } from '@/app/(platform)/planning/medewerker/actions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  Button,
  Input,
} from '@/components/ui'

type Props = {
  medewerkers: Pick<Medewerker, 'id' | 'voornaam' | 'tussenvoegsel' | 'achternaam'>[]
  /** Bestaande afwezigheid om te bewerken; zonder deze prop voer je een nieuwe in. */
  bewerk?: MedewerkerAfwezigheid | null
  onClose: () => void
  onSaved: () => void
}

const VERLOF_TYPEN: MedewerkerAfwezigheidType[] = ['verlof', 'ziek', 'training', 'overig']

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

function medNaam(m: Pick<Medewerker, 'voornaam' | 'tussenvoegsel' | 'achternaam'>): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

/** Verlof dat al in Bouw7 staat: wijzigen en verwijderen gaan daar ook heen. */
function inBouw7(a: MedewerkerAfwezigheid): boolean {
  return a.bron === 'bouw7' || !!a.bouw7_id
}

/** Lokale datum van vandaag — niet toISOString(), dat is UTC en geeft vlak na middernacht gisteren. */
function vandaag(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type FormState = {
  medewerker_id: string
  type: MedewerkerAfwezigheidType
  start_datum: string
  eind_datum: string
  hele_dag: boolean
  start_tijd: string
  eind_tijd: string
  opmerking: string
}

function leegFormulier(medewerker_id: string): FormState {
  const d = vandaag()
  return {
    medewerker_id, type: 'verlof', start_datum: d, eind_datum: d,
    hele_dag: true, start_tijd: '08:00', eind_tijd: '12:00', opmerking: '',
  }
}

function formulierVan(a: MedewerkerAfwezigheid): FormState {
  return {
    medewerker_id: a.medewerker_id,
    type:          a.type,
    start_datum:   a.start_datum,
    eind_datum:    a.eind_datum,
    hele_dag:      !a.start_tijd,
    // Postgres `time` komt terug als HH:MM:SS; het invoerveld en de actie willen HH:MM.
    start_tijd:    a.start_tijd?.slice(0, 5) ?? '08:00',
    eind_tijd:     a.eind_tijd?.slice(0, 5)  ?? '12:00',
    opmerking:     a.opmerking ?? '',
  }
}

export default function VerlofModal({ medewerkers, bewerk = null, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [verwijderen, setVerwijderen] = useState(false)
  const bewerkt = bewerk

  const [form, setForm] = useState<FormState>(() =>
    bewerk ? formulierVan(bewerk) : leegFormulier(medewerkers[0]?.id ?? ''))

  // Bouw7 kent geen soort afwezigheid; bij gesynct verlof blijft die daarom vast op wat hij is.
  const soortVast = bewerkt?.bron === 'bouw7'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const invoer = {
        medewerker_id: form.medewerker_id,
        type:          form.type,
        start_datum:   form.start_datum,
        eind_datum:    form.eind_datum,
        start_tijd:    form.hele_dag ? null : form.start_tijd || null,
        eind_tijd:     form.hele_dag ? null : form.eind_tijd  || null,
        opmerking:     form.opmerking.trim() || null,
      }
      const result = bewerkt
        ? await wijzigAfwezigheid(bewerkt.id, invoer)
        : await maakAfwezigheid(invoer)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(bewerkt ? 'Afwezigheid bijgewerkt' : 'Afwezigheid opgeslagen')
      onSaved()
    })
  }

  function handleVerwijder() {
    if (!bewerkt) return
    setVerwijderen(true)
    startTransition(async () => {
      const result = await verwijderAfwezigheid(bewerkt.id)
      setVerwijderen(false)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Afwezigheid verwijderd')
      onSaved()
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent size="sm">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>{bewerkt ? 'Afwezigheid bewerken' : 'Afwezigheid invoeren'}</DialogTitle>
        </DialogHeader>

        {/* Formulier */}
        <DialogBody className="text-inherit">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {bewerkt && inBouw7(bewerkt) && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--fg-muted)',
            }}>
              Dit verlof staat ook in Bouw7. Je wijziging gaat daar meteen mee naartoe.
            </div>
          )}
          {/* Medewerker */}
          <div>
            <label style={labelStyle}>Medewerker</label>
            <select
              className="eva-input"
              value={form.medewerker_id}
              onChange={e => setForm(f => ({ ...f, medewerker_id: e.target.value }))}
              required
            >
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>{medNaam(m)}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Soort afwezigheid</label>
            <select
              className="eva-input"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as MedewerkerAfwezigheidType }))}
              disabled={soortVast}
              title={soortVast ? 'Bouw7 kent alleen verlof; de soort is hier niet te wijzigen' : undefined}
            >
              {VERLOF_TYPEN.map(t => (
                <option key={t} value={t}>{medewerkerAfwezigheidLabels[t]}</option>
              ))}
            </select>
          </div>

          {/* Datums */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Startdatum</label>
              <Input
                type="date"
                value={form.start_datum}
                onChange={e => setForm(f => ({
                  ...f,
                  start_datum: e.target.value,
                  eind_datum: f.eind_datum < e.target.value ? e.target.value : f.eind_datum,
                }))}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Einddatum</label>
              <Input
                type="date"
                value={form.eind_datum}
                min={form.start_datum}
                onChange={e => setForm(f => ({ ...f, eind_datum: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Hele dag toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.hele_dag}
              onChange={e => setForm(f => ({ ...f, hele_dag: e.target.checked }))}
            />
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Hele dag
            </span>
          </label>

          {/* Tijden (alleen zichtbaar als niet hele dag) */}
          {!form.hele_dag && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Starttijd</label>
                <Input
                  type="time"
                  value={form.start_tijd}
                  onChange={e => setForm(f => ({ ...f, start_tijd: e.target.value }))}
                  required={!form.hele_dag}
                />
              </div>
              <div>
                <label style={labelStyle}>Eindtijd</label>
                <Input
                  type="time"
                  value={form.eind_tijd}
                  min={form.start_datum === form.eind_datum ? form.start_tijd : undefined}
                  onChange={e => setForm(f => ({ ...f, eind_tijd: e.target.value }))}
                  required={!form.hele_dag}
                />
              </div>
            </div>
          )}

          {/* Opmerking */}
          <div>
            <label style={labelStyle}>Opmerking (optioneel)</label>
            <Input
              type="text"
              value={form.opmerking}
              onChange={e => setForm(f => ({ ...f, opmerking: e.target.value }))}
              placeholder="bijv. vakantie Spanje"
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="primary" loading={isPending && !verwijderen} disabled={isPending}>
              {isPending && !verwijderen ? 'Bezig…' : bewerkt ? 'Wijzigingen opslaan' : 'Opslaan'}
            </Button>
            {bewerkt && (
              <Button type="button" variant="secondary" onClick={handleVerwijder} loading={verwijderen} disabled={isPending}>
                {inBouw7(bewerkt) ? 'Verwijderen (ook uit Bouw7)' : 'Verwijderen'}
              </Button>
            )}
          </div>
        </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
