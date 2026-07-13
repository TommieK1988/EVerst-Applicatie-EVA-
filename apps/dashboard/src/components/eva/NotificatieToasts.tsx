'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markeerAlsGelezen, type Notificatie } from '@/app/(platform)/notificaties/actions'

const TYPE_ICOON: Record<string, string> = {
  formulier_taak:      '📋',
  formulier_ingediend: '✅',
  algemeen:            '🔔',
  debiteur:            '💶',
}

const MAX_ZICHTBAAR = 4
const DISMISS_KEY = 'eva-notif-weggeklikt'

function datumTijd(iso: string): string {
  const d = new Date(iso)
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  const tijd  = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${datum} · ${tijd}`
}

function leesWeggeklikt(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function bewaarWeggeklikt(ids: Set<string>) {
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids])) } catch { /* stil */ }
}

type Props = {
  notificaties: Notificatie[]
}

export default function NotificatieToasts({ notificaties }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Notificatie[]>([])
  const [, startTransition] = useTransition()
  // Deze sessie afgehandeld (afgevinkt of weggeklikt) — voorkomt terugkeer bij navigatie.
  const afgehandeld = useRef<Set<string>>(new Set())

  // Verse ongelezen-lijst komt per navigatie binnen; filter wat al is afgehandeld
  // of eerder is weggeklikt, en toon maximaal MAX_ZICHTBAAR kaarten.
  useEffect(() => {
    const weggeklikt = leesWeggeklikt()
    const zichtbaar = notificaties
      .filter(n => !afgehandeld.current.has(n.id) && !weggeklikt.has(n.id))
      .slice(0, MAX_ZICHTBAAR)
    setItems(zichtbaar)
  }, [notificaties])

  function verwijderUitBeeld(id: string) {
    afgehandeld.current.add(id)
    setItems(prev => prev.filter(n => n.id !== id))
  }

  function afvinken(n: Notificatie, e: React.MouseEvent) {
    e.stopPropagation()
    verwijderUitBeeld(n.id)
    startTransition(async () => {
      await markeerAlsGelezen(n.id)
      router.refresh() // topbar-teller bijwerken
    })
  }

  function wegklikken(n: Notificatie, e: React.MouseEvent) {
    e.stopPropagation()
    const weggeklikt = leesWeggeklikt()
    weggeklikt.add(n.id)
    bewaarWeggeklikt(weggeklikt)
    verwijderUitBeeld(n.id)
  }

  function openen(n: Notificatie) {
    verwijderUitBeeld(n.id)
    startTransition(async () => {
      await markeerAlsGelezen(n.id)
      if (n.url) router.push(n.url)
      else router.refresh()
    })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 66, right: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 600,
      width: 340, maxWidth: 'calc(100vw - 32px)',
      pointerEvents: 'none',
    }}>
      {items.map(n => (
        <div
          key={n.id}
          onClick={() => n.url && openen(n)}
          style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 12px 12px 14px',
            background: 'var(--bg-elev, white)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid #009439',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
            cursor: n.url ? 'pointer' : 'default',
            animation: 'evaNotifIn 0.22s ease-out',
          }}
        >
          {/* Afvink-vakje */}
          <button
            type="button"
            onClick={(e) => afvinken(n, e)}
            title="Markeer als gelezen"
            style={{
              flexShrink: 0, marginTop: 1,
              width: 20, height: 20, borderRadius: 5,
              border: '1.5px solid var(--border)',
              background: 'transparent',
              color: '#009439',
              cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,148,57,0.10)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </button>

          {/* Inhoud — 3 regels */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{TYPE_ICOON[n.type] ?? '🔔'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3 }}>
                {n.titel}
              </span>
            </div>
            {(n.dossier_naam ?? n.body) && (
              <div style={{
                fontSize: 12, fontWeight: 500, color: 'var(--fg-soft)', marginTop: 3, lineHeight: 1.35,
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {n.dossier_naam ?? n.body}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 5 }}>
              {datumTijd(n.aangemaakt_op)}
            </div>
          </div>

          {/* Wegklikken */}
          <button
            type="button"
            onClick={(e) => wegklikken(n, e)}
            title="Wegklikken (blijft ongelezen)"
            style={{
              flexShrink: 0,
              width: 22, height: 22, borderRadius: 5,
              border: 'none', background: 'transparent',
              color: 'var(--fg-muted)', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}

      <style>{`
        @keyframes evaNotifIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
