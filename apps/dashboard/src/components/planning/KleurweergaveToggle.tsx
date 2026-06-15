'use client'

import { useState, useEffect } from 'react'

export type Kleurweergave = 'medewerker' | 'uursoort'

const STORAGE_KEY = 'planning-kleurweergave'

export function useKleurweergave(): [Kleurweergave, (v: Kleurweergave) => void] {
  const [waarde, setWaarde] = useState<Kleurweergave>('medewerker')

  useEffect(() => {
    try {
      const opgeslagen = localStorage.getItem(STORAGE_KEY)
      if (opgeslagen === 'medewerker' || opgeslagen === 'uursoort') setWaarde(opgeslagen)
    } catch {}
  }, [])

  function stel(v: Kleurweergave) {
    setWaarde(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch {}
  }

  return [waarde, stel]
}

export function KleurweergaveToggle({
  waarde,
  onChange,
}: {
  waarde: Kleurweergave
  onChange: (v: Kleurweergave) => void
}) {
  const btnBase: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 10px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.1s, color 0.1s',
  }
  const actief: React.CSSProperties = {
    background: 'var(--fg)',
    color: 'var(--bg)',
    borderColor: 'var(--fg)',
  }
  const inactief: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--fg-muted)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <button
        type="button"
        style={{ ...btnBase, border: 'none', borderRight: '1px solid var(--border)', borderRadius: 0, ...(waarde === 'medewerker' ? actief : inactief) }}
        onClick={() => onChange('medewerker')}
        title="Kleur per medewerker"
      >
        Medewerker
      </button>
      <button
        type="button"
        style={{ ...btnBase, border: 'none', borderRadius: 0, ...(waarde === 'uursoort' ? actief : inactief) }}
        onClick={() => onChange('uursoort')}
        title="Kleur per uursoort / categorie"
      >
        Uursoort
      </button>
    </div>
  )
}
