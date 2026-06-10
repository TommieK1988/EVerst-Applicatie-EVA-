'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Uurtarief } from '@everts/database/platform-types'
import { setUurtarieven } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { Button, Input } from '@/components/ui'

export default function UurtariefBeheer({ initial }: { initial: Uurtarief[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [tarieven, setTarieven] = useState<Uurtarief[]>(initial)
  const [busy, setBusy] = useState(false)

  function update(idx: number, patch: Partial<Uurtarief>) {
    setTarieven(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }
  function remove(idx: number) {
    setTarieven(prev => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setTarieven(prev => [...prev, { label: '', tarief: 0 }])
  }
  function setFavoriet(idx: number) {
    setTarieven(prev => prev.map((t, i) => ({ ...t, is_favoriet: i === idx ? true : undefined })))
  }
  async function opslaan() {
    setBusy(true)
    const cleaned = tarieven
      .filter(t => t.label.trim())
      .map(t => ({ label: t.label.trim(), tarief: t.tarief || 0, ...(t.is_favoriet ? { is_favoriet: true } : {}) }))
    const r = await setUurtarieven(cleaned)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Uurtarieven opgeslagen')
    startT(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tarieven.length === 0 && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12 }} className="text-neutral-500">
          Nog geen uurtarieven ingesteld. Voeg er één toe om te beginnen.
        </p>
      )}
      {tarieven.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button title={t.is_favoriet ? 'Standaard tarief' : 'Instellen als standaard'}
            onClick={() => setFavoriet(i)}
            style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: t.is_favoriet ? '#d4a017' : 'var(--fg-muted)', fontSize: 16, lineHeight: 1 }}>
            {t.is_favoriet ? '★' : '☆'}
          </button>
          <Input placeholder="Naam (bv. Schilder A)" value={t.label}
            onChange={e => update(i, { label: e.target.value })} style={{ flex: 1 }} />
          <div style={{ width: 130 }}>
            <Input type="number" min="0" step="0.5" value={t.tarief}
              onChange={e => update(i, { tarief: parseFloat(e.target.value) || 0 })}
              prefix={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>€</span>}
              suffix={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>/uur</span>}
              style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <button onClick={() => remove(i)}
            style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 16 }}
            title="Verwijderen">×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={add}>+ Tarief toevoegen</Button>
        <Button variant="primary" size="sm" onClick={opslaan} loading={busy} disabled={busy} style={{ marginLeft: 'auto' }}>
          {busy ? 'Bezig…' : 'Opslaan'}
        </Button>
      </div>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, marginTop: 4 }} className="text-neutral-500">
        ★ = standaard uurtarief bij nieuw project. Tarieven worden gedeeld met everts-calc en getoond in de Gantt-planning.
      </p>
    </div>
  )
}
