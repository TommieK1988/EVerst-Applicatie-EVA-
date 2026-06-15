'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, EmptyState, Input, Switch } from '@/components/ui'
import {
  type ToggleDefinitie,
  maakToggleDefinitie,
  setToggleDefinitieActief,
  verwijderToggleDefinitie,
} from './actions'

export default function DossierTogglesBeheer({ initial }: { initial: ToggleDefinitie[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [nieuw, setNieuw] = useState('')
  const [busy, setBusy] = useState(false)

  async function voegToe() {
    const v = nieuw.trim()
    if (!v) return
    setBusy(true)
    const r = await maakToggleDefinitie(v)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    setNieuw('')
    toast.success('Toggle toegevoegd')
    startT(() => router.refresh())
  }

  async function zetActief(id: string, actief: boolean) {
    const r = await setToggleDefinitieActief(id, actief)
    if (!r.ok) { toast.error(r.error); return }
    startT(() => router.refresh())
  }

  async function verwijder(id: string) {
    const r = await verwijderToggleDefinitie(id)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Toggle verwijderd')
    startT(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        Toggles verschijnen als aan/uit-schakelaars op elk dossier en kunnen actielijst-sjablonen triggeren of filteren.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {initial.map(def => (
          <div key={def.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{def.label}</div>
              <div style={{ fontFamily: 'var(--, monospace)', fontSize: 11, color: 'var(--fg-muted)' }}>{def.sleutel}</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
              <Switch checked={def.actief} onCheckedChange={(v: boolean) => zetActief(def.id, v)} />
              Actief
            </label>
            <Button variant="ghost" size="icon-sm" onClick={() => verwijder(def.id)} title="Verwijderen">×</Button>
          </div>
        ))}
        {initial.length === 0 && (
          <EmptyState size="sm" title="Nog geen toggles ingesteld" tone="neutral" />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Input
          type="text"
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && voegToe()}
          placeholder="bijv. Spoed"
          style={{ width: 200 }}
        />
        <Button variant="primary" size="sm" onClick={voegToe} loading={busy} style={{ marginLeft: 'auto' }}>
          + Toevoegen
        </Button>
      </div>
    </div>
  )
}
