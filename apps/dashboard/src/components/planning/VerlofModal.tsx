'use client'

import { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Lock } from 'lucide-react'
import type { Medewerker, MedewerkerAfwezigheid, MedewerkerAfwezigheidType } from '@everts/database/platform-types'
import { medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import { maakAfwezigheid, verwijderAfwezigheid, haalAfwezigheidInPeriode } from '@/app/(platform)/planning/medewerker/actions'
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
  periodeStart: string
  periodeEinde: string
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

function tijdLabel(a: MedewerkerAfwezigheid): string {
  if (a.start_tijd && a.eind_tijd) return ` · ${a.start_tijd}–${a.eind_tijd}`
  if (a.start_tijd) return ` · vanaf ${a.start_tijd}`
  return ''
}

export default function VerlofModal({ medewerkers, periodeStart, periodeEinde, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [bestaand, setBestaand] = useState<MedewerkerAfwezigheid[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    medewerker_id: medewerkers[0]?.id ?? '',
    type: 'verlof' as MedewerkerAfwezigheidType,
    start_datum: periodeStart,
    eind_datum: periodeStart,
    hele_dag: true,
    start_tijd: '08:00',
    eind_tijd: '12:00',
    opmerking: '',
  })

  function laadBestaand() {
    haalAfwezigheidInPeriode(periodeStart, periodeEinde).then(setBestaand)
  }

  useEffect(() => { laadBestaand() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await maakAfwezigheid({
        medewerker_id: form.medewerker_id,
        type:          form.type,
        start_datum:   form.start_datum,
        eind_datum:    form.eind_datum,
        start_tijd:    form.hele_dag ? null : form.start_tijd || null,
        eind_tijd:     form.hele_dag ? null : form.eind_tijd  || null,
        opmerking:     form.opmerking.trim() || null,
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Afwezigheid opgeslagen')
      laadBestaand()
      onSaved()
    })
  }

  function handleVerwijder(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const result = await verwijderAfwezigheid(id)
      setDeletingId(null)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Afwezigheid verwijderd')
      laadBestaand()
      onSaved()
    })
  }

  const medewerkerMap = Object.fromEntries(medewerkers.map(m => [m.id, m]))

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent size="sm">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>Afwezigheid invoeren</DialogTitle>
        </DialogHeader>

        {/* Formulier */}
        <DialogBody className="text-inherit">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

          <Button
            type="submit"
            variant="primary"
            loading={isPending}
            style={{ alignSelf: 'flex-start' }}
          >
            {isPending ? 'Bezig…' : 'Opslaan'}
          </Button>
        </form>

        {/* Bestaande records in deze periode */}
        {bestaand.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 8,
            }}>
              Afwezigheid in deze periode
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bestaand.map(a => {
                const med = medewerkerMap[a.medewerker_id]
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg)',
                      }}>
                        {med ? medNaam(med) : a.medewerker_id}
                        <span style={{
                          marginLeft: 6,
                          fontSize: 9, fontWeight: 700,
                          color: 'var(--fg-muted)', textTransform: 'uppercase',
                        }}>
                          {medewerkerAfwezigheidLabels[a.type]}
                        </span>
                        {a.bron === 'bouw7' && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                            color: 'var(--accent)', textTransform: 'uppercase',
                          }}>
                            Bouw7
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--fg-muted)', marginTop: 1,
                      }}>
                        {a.start_datum === a.eind_datum ? a.start_datum : `${a.start_datum} – ${a.eind_datum}`}
                        {tijdLabel(a)}
                        {a.opmerking && ` · ${a.opmerking}`}
                      </div>
                    </div>
                    {a.bron === 'bouw7' ? (
                      <span
                        style={{ flexShrink: 0, color: 'var(--fg-muted)' }}
                        title="Uit Bouw7 gesynct — wijzig in Bouw7"
                      >
                        <Lock size={12} />
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleVerwijder(a.id)}
                        disabled={deletingId === a.id}
                        style={{
                          flexShrink: 0,
                          opacity: deletingId === a.id ? 0.4 : 1,
                        }}
                        title="Verwijder"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
