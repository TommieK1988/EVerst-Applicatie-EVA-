'use client'

import React, { useEffect, useState } from 'react'
import { LOCATIE_AUTO_KEY } from './LocatieAutoOpen'

/**
 * Instelling "Automatisch dossier openen op locatie" (mobiel profiel).
 * Standaard aan; per apparaat opgeslagen in localStorage. 'uit' schakelt de
 * detectie op de home uit (zie LocatieAutoOpen).
 */
export default function LocatieAutoToggle() {
  // Start op null tot we localStorage gelezen hebben (voorkomt hydration-mismatch).
  const [aan, setAan] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setAan(localStorage.getItem(LOCATIE_AUTO_KEY) !== 'uit')
    } catch {
      setAan(true)
    }
  }, [])

  const wissel = () => {
    const nieuw = !(aan ?? true)
    setAan(nieuw)
    try {
      localStorage.setItem(LOCATIE_AUTO_KEY, nieuw ? 'aan' : 'uit')
    } catch {
      /* private mode — negeren */
    }
  }

  const actief = aan ?? true

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 16, background: 'var(--bg-elev)',
        border: '1px solid var(--border)', borderRadius: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
          Dossier openen op locatie
        </div>
        <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 3, lineHeight: 1.4 }}>
          Opent bij het starten van de app automatisch het dossier dat bij jouw locatie hoort.
        </div>
      </div>
      <button
        role="switch"
        aria-checked={actief}
        aria-label="Dossier openen op locatie"
        onClick={wissel}
        disabled={aan === null}
        style={{
          position: 'relative', width: 46, height: 28, flexShrink: 0,
          borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
          background: actief ? '#009439' : '#c7ced2',
          transition: 'background 140ms', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 3, left: actief ? 21 : 3,
            width: 22, height: 22, borderRadius: '50%', background: '#fff',
            transition: 'left 140ms', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </button>
    </div>
  )
}
