'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChangelogItem } from '@/app/(platform)/wat-is-nieuw/actions'

const DISMISS_KEY = 'eva-updates-popup-gezien'

type Props = {
  updates: ChangelogItem[]
  /** Echt aantal ongelezen updates (kan groter zijn dan de getoonde lijst). */
  totaal?: number
}

/**
 * Eenmalige (per browsersessie) popup rechtsboven die meldt dat er nieuwe updates
 * in EVA zijn. Wegklikken onderdrukt alleen deze sessie; als-gezien markeren gebeurt
 * uitsluitend door de pagina "Wat is nieuw" te bezoeken, zodat de badge blijft staan
 * tot men echt heeft gekeken.
 */
export default function UpdatesPopup({ updates, totaal }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (updates.length === 0) return
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return
    } catch { /* geen sessionStorage */ }
    setOpen(true)
  }, [updates])

  function wegklikken() {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* stil */ }
    setOpen(false)
  }

  function bekijken() {
    wegklikken()
    router.push('/wat-is-nieuw')
  }

  if (!open || updates.length === 0) return null

  const aantal = totaal && totaal > updates.length ? totaal : updates.length
  const top = updates.slice(0, 3)

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 16, zIndex: 620,
      width: 340, maxWidth: 'calc(100vw - 32px)',
    }}>
      <div style={{
        background: 'var(--bg-elev, white)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #009439',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        padding: '14px 14px 12px',
        animation: 'evaUpdatesIn 0.24s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 18, lineHeight: 1.1 }}>✨</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>
              {aantal} {aantal === 1 ? 'nieuwe update' : 'nieuwe updates'} in EVA
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1 }}>
              Sinds je laatste bezoek
            </div>
          </div>
          <button
            type="button"
            onClick={wegklikken}
            title="Wegklikken"
            style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: 5,
              border: 'none', background: 'transparent', color: 'var(--fg-muted)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <ul style={{ listStyle: 'none', margin: '10px 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {top.map(u => (
            <li key={u.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 7,
              fontSize: 12.5, color: 'var(--fg-soft)', lineHeight: 1.35,
            }}>
              <span style={{ color: '#009439', fontWeight: 700, flexShrink: 0 }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.titel}</span>
            </li>
          ))}
          {aantal > top.length && (
            <li style={{ fontSize: 11.5, color: 'var(--fg-muted)', paddingLeft: 14 }}>
              en nog {aantal - top.length} {aantal - top.length === 1 ? 'update' : 'updates'}…
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={bekijken}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: 'none', background: '#009439', color: 'white',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Bekijk wat er nieuw is
        </button>
      </div>

      <style>{`
        @keyframes evaUpdatesIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
