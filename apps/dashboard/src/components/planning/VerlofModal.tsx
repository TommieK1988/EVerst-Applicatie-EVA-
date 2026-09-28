'use client'

import { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Lock } from 'lucide-react'
import type { Medewerker, MedewerkerAfwezigheid, MedewerkerAfwezigheidType } from '@everts/database/platform-types'
import { medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import { maakAfwezigheid, wijzigAfwezigheid, verwijderAfwezigheid, haalAfwezigheidInPeriode } from '@/app/(platform)/planning/medewerker/actions'
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

/** Verlof dat al in Bouw7 staat, is daar leidend en hier alleen-lezen. */
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

function tijdLabel(a: MedewerkerAfwezigheid): string {
  if (a.start_tijd && a.eind_tijd) return ` · ${a.start_tijd}–${a.eind_tijd}`
  if (a.start_tijd) return ` · vanaf ${a.start_tijd}`
  return ''
}

export default function VerlofModal({ medewerkers, periodeStart, periodeEinde, bewerk = null, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [bestaand, setBestaand] = useState<MedewerkerAfwezigheid[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bewerkt, setBewerkt] = useState<MedewerkerAfwezigheid | null>(bewerk)

  const [form, setForm] = useState<FormState>(() =>
    bewerk ? formulierVan(bewerk) : leegFormulier(medewerkers[0]?.id ?? ''))

  function startBewerken(a: MedewerkerAfwezigheid) {
    setBewerkt(a)
    setForm(formulierVan(a))
  }

  function nieuwInvoeren() {
    setBewerkt(null)
    setForm(f => leegFormulier(f.medewerker_id))
  }

  const alleenLezen = !!bewerkt && inBouw7(bewerkt)

  function laadBestaand() {
    haalAfwezigheidInPeriode(periodeStart, periodeEinde).then(setBestaand)
  }

  useEffect(() => { laadBestaand() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (alleenLezen) return
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
      if (bewerkt?.id === id) nieuwInvoeren()
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
          <DialogTitle>{bewerkt ? 'Afwezigheid bewerken' : 'Afwezigheid invoeren'}</DialogTitle>
        </DialogHeader>

        {/* Formulier */}
        <DialogBody className="text-inherit">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {alleenLezen && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--fg-muted)',
            }}>
              <Lock size={12} style={{ flexShrink: 0 }} />
              Dit verlof staat in Bouw7 en kan alleen daar gewijzigd worden.
            </div>
          )}
          <fieldset disabled={alleenLezen} style={{ display: 'contents' }}>
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

          </fieldset>

          <div style={{ display: 'flex', gap: 8 }}>
            {!alleenLezen && (
              <Button type="submit" variant="primary" loading={isPending}>
                {isPending ? 'Bezig…' : bewerkt ? 'Wijzigingen opslaan' : 'Opslaan'}
              </Button>
            )}
            {bewerkt && (
              <Button type="button" variant="secondary" onClick={nieuwInvoeren} disabled={isPending}>
                Nieuwe invoeren
              </Button>
            )}
          </div>
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
                const actief = bewerkt?.id === a.id
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    title={inBouw7(a) ? 'Bekijken' : 'Klik om te bewerken'}
                    onClick={() => startBewerken(a)}
                    onKeyDown={e => { if (e.key === 'Enter') startBewerken(a) }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: 'var(--bg)',
                      border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
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
                    {inBouw7(a) ? (
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
                        onClick={e => { e.stopPropagation(); handleVerwijder(a.id) }}
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
