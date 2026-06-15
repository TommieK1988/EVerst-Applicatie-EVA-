'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { setBtwTarieven } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { Button, EmptyState, Input } from '@/components/ui'

export default function BtwTarievenBeheer({ initial }: { initial: number[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [tarieven, setTarieven] = useState<number[]>(initial)
  const [nieuw, setNieuw] = useState('')
  const [busy, setBusy] = useState(false)

  function voegToe() {
    const v = parseFloat(nieuw)
    if (isNaN(v) || v < 0 || v > 100) return
    if (!tarieven.includes(v)) setTarieven(prev => [...prev, v].sort((a, b) => a - b))
    setNieuw('')
  }

  function verwijder(tarief: number) {
    setTarieven(prev => prev.filter(t => t !== tarief))
  }

  async function opslaan() {
    setBusy(true)
    const r = await setBtwTarieven(tarieven)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('BTW tarieven opgeslagen')
    startT(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        Beschikbare BTW-percentages die gebruikt worden in calculatieregels en offertes.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tarieven.map(t => (
          <div key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{t}%</span>
            <Button variant="ghost" size="sm" onClick={() => verwijder(t)} title="Verwijderen" style={{ padding: 0, lineHeight: 1, minWidth: 0, height: 'auto' }}>×</Button>
          </div>
        ))}
        {tarieven.length === 0 && (
          <EmptyState size="sm" tone="neutral" title="Nog geen BTW-tarieven ingesteld" />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 100 }}>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={nieuw}
            onChange={e => setNieuw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && voegToe()}
            placeholder="bijv. 21"
            suffix="%"
            style={{  }}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={voegToe}>+ Toevoegen</Button>
        <Button variant="primary" size="sm" onClick={opslaan} loading={busy} style={{ marginLeft: 'auto' }}>
          {busy ? 'Bezig…' : 'Opslaan'}
        </Button>
      </div>
    </div>
  )
}
