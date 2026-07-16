'use client'
import React from 'react'

/**
 * Lichte modal. Centrering via flex op de overlay; het kaartje zelf krijgt géén
 * transform-centrering (voorkomt de transform-centrering + transform-animatie
 * valkuil). Sluiten via achtergrond-klik of Escape.
 */
export default function Modal({
  titel, onSluit, children, breedte = 480,
}: {
  titel: string
  onSluit: () => void
  children: React.ReactNode
  breedte?: number
}) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onSluit])

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: breedte, maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)', padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{titel}</h2>
          <button onClick={onSluit} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const modalInput: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
}
export const modalLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--fg-soft)', marginBottom: 4, display: 'block',
}
