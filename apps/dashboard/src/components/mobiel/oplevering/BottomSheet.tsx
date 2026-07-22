'use client'

import React, { useEffect } from 'react'
import { GRIJS, RAND, TEKST } from './stijl'

/**
 * Invoerpaneel dat vanaf de onderkant over het scherm valt. Op een telefoon is dat prettiger dan
 * een gecentreerde modal: je duim zit onderaan, en het toetsenbord duwt de inhoud niet uit beeld.
 *
 * LET OP — hier mág `position: fixed`, en dat is de uitzondering op de regel in
 * `MobielStickyFooter`. Die regel gaat over knoppen bínnen het scrollende content-gebied; een
 * overlay moet juist over de hele shell heen liggen, inclusief de kopbalk.
 */
export default function BottomSheet({ titel, onSluit, children }: {
  titel: string
  onSluit: () => void
  children: React.ReactNode
}) {
  // Achtergrond niet mee laten scrollen zolang het paneel open staat.
  useEffect(() => {
    const vorige = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = vorige }
  }, [])

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(22, 27, 32, 0.45)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elev)',
          borderRadius: '18px 18px 0 0',
          padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '88vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {/* Greepje: maakt zonder woorden duidelijk dat dit paneel weg kan. */}
        <div style={{ width: 38, height: 4, borderRadius: 999, background: RAND, margin: '4px auto 2px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEKST }}>{titel}</div>
          <button
            type="button"
            onClick={onSluit}
            aria-label="Sluiten"
            style={{
              background: 'none', border: 'none', color: GRIJS, fontSize: 15,
              padding: '6px 4px', cursor: 'pointer',
            }}
          >
            Annuleren
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
