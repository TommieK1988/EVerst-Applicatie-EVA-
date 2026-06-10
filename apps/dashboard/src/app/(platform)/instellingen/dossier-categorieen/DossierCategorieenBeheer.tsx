'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { setDossierCategorieen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { Button, EmptyState, Input } from '@/components/ui'

export default function DossierCategorieenBeheer({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [categorieen, setCategorieen] = useState<string[]>(initial)
  const [nieuw, setNieuw] = useState('')
  const [busy, setBusy] = useState(false)

  function voegToe() {
    const v = nieuw.trim()
    if (!v) return
    if (!categorieen.includes(v)) setCategorieen(prev => [...prev, v])
    setNieuw('')
  }

  function verwijder(cat: string) {
    setCategorieen(prev => prev.filter(c => c !== cat))
  }

  async function opslaan() {
    setBusy(true)
    const r = await setDossierCategorieen(categorieen)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Categorieën opgeslagen')
    startT(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        Beschikbare categorieën die als keuze verschijnen bij aanvragen, offertes en opdrachten.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {categorieen.map(cat => (
          <div key={cat} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{cat}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => verwijder(cat)}
              title="Verwijderen"
            >×</Button>
          </div>
        ))}
        {categorieen.length === 0 && (
          <EmptyState
            size="sm"
            title="Nog geen categorieën ingesteld"
            tone="neutral"
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Input
          type="text"
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && voegToe()}
          placeholder="bijv. Dakrenovatie"
          style={{ width: 200 }}
        />
        <Button variant="ghost" size="sm" onClick={voegToe}>+ Toevoegen</Button>
        <Button variant="primary" size="sm" onClick={opslaan} loading={busy} style={{ marginLeft: 'auto' }}>
          Opslaan
        </Button>
      </div>
    </div>
  )
}
