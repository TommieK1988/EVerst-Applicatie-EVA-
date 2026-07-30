'use client'

import React from 'react'
import { stelWachtwoordIn } from './actions'

const veldStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', fontSize: 15,
  border: '1px solid #d0d0d0', borderRadius: 12,
  background: '#fff', color: '#1a1a1a',
  WebkitTapHighlightColor: 'transparent',
}

/**
 * Wachtwoord kiezen na een uitnodiging. De sessie is al gezet door de callback;
 * na opslaan door naar de mobiele omgeving.
 */
export default function WachtwoordForm() {
  const [nieuw, setNieuw] = React.useState('')
  const [bevestig, setBevestig] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function opslaan(e: React.FormEvent) {
    e.preventDefault()
    setFout(null)
    setLoading(true)
    const res = await stelWachtwoordIn({ nieuw, bevestig })
    if (!res.ok) { setFout(res.error); setLoading(false); return }
    // Volledige navigatie zodat de middleware de sessie vers oppakt.
    window.location.assign('/m')
  }

  return (
    <form onSubmit={opslaan} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="password"
        placeholder="Nieuw wachtwoord"
        autoComplete="new-password"
        value={nieuw}
        onChange={e => setNieuw(e.target.value)}
        style={veldStyle}
        required
      />
      <input
        type="password"
        placeholder="Herhaal wachtwoord"
        autoComplete="new-password"
        value={bevestig}
        onChange={e => setBevestig(e.target.value)}
        style={veldStyle}
        required
      />

      {fout && (
        <div style={{
          padding: '10px 14px', background: '#fff2f0', border: '1px solid #ffc9c0',
          borderRadius: 10, fontSize: 13, color: '#c0392b',
        }}>{fout}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '16px 20px',
          background: loading ? '#f0f0f0' : '#009439',
          color: loading ? '#999' : '#fff',
          border: 'none', borderRadius: 12,
          fontSize: 15, fontWeight: 700,
          cursor: loading ? 'default' : 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {loading ? 'Opslaan…' : 'Wachtwoord opslaan'}
      </button>
    </form>
  )
}
