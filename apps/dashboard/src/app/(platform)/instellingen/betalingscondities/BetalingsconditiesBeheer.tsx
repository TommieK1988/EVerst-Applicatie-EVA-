'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input, Card, CardBody, EmptyState } from '@/components/ui'
import type { Betalingsconditie, Termijn } from './actions'
import {
  maakBetalingsconditie,
  updateBetalingsconditie,
  verwijderBetalingsconditie,
  setStandaardBetalingsconditie,
} from './actions'

const LEEG_TERMIJN: Termijn = { omschrijving: '', percentage: 0 }

function TermijnenEditor({
  termijnen,
  onChange,
}: {
  termijnen: Termijn[]
  onChange: (t: Termijn[]) => void
}) {
  const totaal = termijnen.reduce((s, t) => s + (t.percentage || 0), 0)
  const afwijking = Math.abs(totaal - 100) > 0.01

  function update(i: number, patch: Partial<Termijn>) {
    onChange(termijnen.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }
  function voegToe() { onChange([...termijnen, { ...LEEG_TERMIJN }]) }
  function verwijder(i: number) { onChange(termijnen.filter((_, idx) => idx !== i)) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Termijnen
      </div>
      {termijnen.length === 0 && (
        <EmptyState size="sm" tone="neutral" title="Nog geen termijnen" description="Voeg er één toe." />
      )}
      {termijnen.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            placeholder="Omschrijving (bv. Aanbetaling bij opdracht)"
            value={t.omschrijving}
            onChange={e => update(i, { omschrijving: e.target.value })}
            style={{ flex: 1 }}
          />
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={t.percentage}
            onChange={e => update(i, { percentage: parseFloat(e.target.value) || 0 })}
            suffix="%"
            style={{ width: 90, fontFamily: 'var(--font-mono)' }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => verwijder(i)}
            title="Verwijderen"
          >×</Button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="ghost" size="sm" onClick={voegToe}>+ Termijn toevoegen</Button>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: afwijking ? '#c0392b' : '#27ae60',
          marginLeft: 'auto',
        }}>
          Totaal: {totaal}%{afwijking ? ' ⚠ moet 100% zijn' : ' ✓'}
        </span>
      </div>
    </div>
  )
}

interface EditState {
  open: boolean
  item?: Betalingsconditie
  naam: string
  termijnen: Termijn[]
}

export default function BetalingsconditiesBeheer({ initial }: { initial: Betalingsconditie[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [condities, setCondities] = useState(initial)
  const [edit, setEdit] = useState<EditState>({ open: false, naam: '', termijnen: [] })
  const [busy, setBusy] = useState(false)

  function openNieuw() {
    setEdit({ open: true, naam: '', termijnen: [{ omschrijving: '', percentage: 100 }] })
  }

  function openBewerk(item: Betalingsconditie) {
    setEdit({ open: true, item, naam: item.naam, termijnen: [...item.termijnen] })
  }

  function sluit() {
    setEdit({ open: false, naam: '', termijnen: [] })
  }

  async function opslaan() {
    if (!edit.naam.trim()) { toast.error('Geef een naam op'); return }
    setBusy(true)
    try {
      if (edit.item) {
        await updateBetalingsconditie(edit.item.id, { naam: edit.naam, termijnen: edit.termijnen })
        setCondities(prev => prev.map(c => c.id === edit.item!.id ? { ...c, naam: edit.naam, termijnen: edit.termijnen } : c))
        toast.success('Bijgewerkt')
      } else {
        const id = await maakBetalingsconditie({ naam: edit.naam, termijnen: edit.termijnen })
        setCondities(prev => [...prev, {
          id, naam: edit.naam, termijnen: edit.termijnen,
          is_standaard: false, volgorde: 0, created_at: new Date().toISOString(),
        }])
        toast.success('Aangemaakt')
      }
      sluit()
      startT(() => router.refresh())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function verwijder(id: string, naam: string) {
    if (!confirm(`"${naam}" verwijderen?`)) return
    try {
      await verwijderBetalingsconditie(id)
      setCondities(prev => prev.filter(c => c.id !== id))
      toast.success('Verwijderd')
      startT(() => router.refresh())
    } catch (e) {
      toast.error(String(e))
    }
  }

  async function setStandaard(id: string) {
    try {
      await setStandaardBetalingsconditie(id)
      setCondities(prev => prev.map(c => ({ ...c, is_standaard: c.id === id })))
      startT(() => router.refresh())
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {condities.length === 0 && !edit.open && (
        <EmptyState size="sm" tone="neutral" title="Nog geen betalingscondities" description="Voeg er één toe om te beginnen." />
      )}

      {condities.map(c => (
        <Card key={c.id}>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: c.termijnen.length > 0 ? 10 : 0 }}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setStandaard(c.id)}
                title={c.is_standaard ? 'Standaard conditie' : 'Instellen als standaard'}
                className={c.is_standaard ? 'text-amber-500' : 'text-neutral-400'}
              >
                {c.is_standaard ? '★' : '☆'}
              </Button>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>{c.naam}</span>
              <Button variant="ghost" size="sm" onClick={() => openBewerk(c)}>Bewerken</Button>
              <Button variant="ghost" size="sm" onClick={() => verwijder(c.id, c.naam)}>Verwijder</Button>
            </div>
            {c.termijnen.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 28 }}>
                {c.termijnen.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--fg)', minWidth: 36 }}>{t.percentage}%</span>
                    <span>{t.omschrijving}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}

      {edit.open ? (
        <Card>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                {edit.item ? 'Betalingsconditie bewerken' : 'Nieuwe betalingsconditie'}
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Naam</label>
                <Input
                  placeholder="Naam (bv. Standaard 30/40/30)"
                  value={edit.naam}
                  onChange={e => setEdit(s => ({ ...s, naam: e.target.value }))}
                />
              </div>
              <TermijnenEditor
                termijnen={edit.termijnen}
                onChange={termijnen => setEdit(s => ({ ...s, termijnen }))}
              />
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>
                Betalingstermijn (aantal dagen) stel je in bij de relatiegegevens.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={sluit}>Annuleren</Button>
                <Button variant="primary" size="sm" onClick={opslaan} loading={busy} disabled={busy}>
                  Opslaan
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div>
          <Button variant="ghost" size="sm" onClick={openNieuw}>+ Betalingsconditie toevoegen</Button>
        </div>
      )}
    </div>
  )
}
