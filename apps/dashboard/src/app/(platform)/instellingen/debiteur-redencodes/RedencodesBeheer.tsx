'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { maakRedencode, updateRedencode, verwijderRedencode, type Redencode } from '@/lib/debiteuren/actions'

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', background: 'white',
}

export default function RedencodesBeheer({ initial }: { initial: Redencode[] }) {
  const router = useRouter()
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerkLabel, setBewerkLabel] = useState('')

  async function toevoegen() {
    if (!nieuw.trim()) return
    setBezig(true)
    try {
      const res = await maakRedencode(nieuw)
      if (!res.ok) { toast.error(res.error); return }
      setNieuw('')
      toast.success('Redencode toegevoegd')
      router.refresh()
    } finally { setBezig(false) }
  }

  async function opslaanLabel(id: string) {
    if (!bewerkLabel.trim()) return
    const res = await updateRedencode(id, { label: bewerkLabel })
    if (!res.ok) { toast.error(res.error); return }
    setBewerkId(null)
    toast.success('Opgeslagen')
    router.refresh()
  }

  async function toggleActief(r: Redencode) {
    const res = r.actief ? await verwijderRedencode(r.id) : await updateRedencode(r.id, { actief: true })
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toevoegen */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') toevoegen() }}
          placeholder="Nieuwe reden, bv. 'Wachten op creditnota'"
        />
        <Button variant="primary" onClick={toevoegen} disabled={bezig || !nieuw.trim()}>Toevoegen</Button>
      </div>

      {/* Lijst */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {initial.length === 0 && <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>Nog geen redencodes.</span>}
        {initial.map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderRadius: 8, border: '1px solid var(--border)',
            background: r.actief ? 'white' : 'var(--bg-subtle)', opacity: r.actief ? 1 : 0.6,
          }}>
            {bewerkId === r.id ? (
              <>
                <input style={{ ...inputStyle, flex: 1 }} value={bewerkLabel} autoFocus
                  onChange={e => setBewerkLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') opslaanLabel(r.id); if (e.key === 'Escape') setBewerkId(null) }} />
                <Button variant="primary" onClick={() => opslaanLabel(r.id)}>Opslaan</Button>
                <Button variant="secondary" onClick={() => setBewerkId(null)}>Annuleer</Button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--fg)' }}>{r.label}</span>
                {!r.actief && <span style={{ fontSize: 11, color: 'var(--fg-soft)' }}>inactief</span>}
                <button onClick={() => { setBewerkId(r.id); setBewerkLabel(r.label) }}
                  style={{ ...inputStyle, padding: '4px 10px', cursor: 'pointer', background: 'white' }}>Bewerk</button>
                <button onClick={() => toggleActief(r)}
                  style={{ ...inputStyle, padding: '4px 10px', cursor: 'pointer', background: 'white', color: r.actief ? '#dc2626' : '#16a34a' }}>
                  {r.actief ? 'Deactiveer' : 'Activeer'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
