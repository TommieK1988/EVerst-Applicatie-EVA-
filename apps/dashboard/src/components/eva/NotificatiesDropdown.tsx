'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getNotificaties, markeerAlsGelezen, markeerAlleAlsGelezen, type Notificatie } from '@/app/(platform)/notificaties/actions'
import { isDossierPad, openDossierInNieuwTabblad } from '@/components/dossiers/open-dossier'

const TYPE_ICOON: Record<string, string> = {
  formulier_taak:      '📋',
  formulier_ingediend: '✅',
  algemeen:            '🔔',
}

function datumTijd(iso: string): string {
  const d = new Date(iso)
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  const tijd  = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${datum} · ${tijd}`
}

type Props = {
  aantalOngelezen: number
}

export default function NotificatiesDropdown({ aantalOngelezen: initialCount }: Props) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [notificaties, setNotificaties] = useState<Notificatie[]>([])
  const [ongelezen, setOngelezen] = useState(initialCount)
  const [geladen, setGeladen]     = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Sluit bij klik buiten
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function laadNotificaties() {
    if (geladen) return
    const result = await getNotificaties(10)
    setNotificaties(result.notificaties)
    setOngelezen(result.ongelezen)
    setGeladen(true)
  }

  async function handleOpen() {
    setOpen(prev => !prev)
    if (!open) await laadNotificaties()
  }

  function handleKlik(n: Notificatie) {
    setOpen(false)
    startTransition(async () => {
      if (!n.gelezen) {
        await markeerAlsGelezen(n.id)
        setNotificaties(prev => prev.map(x => x.id === n.id ? { ...x, gelezen: true } : x))
        setOngelezen(prev => Math.max(0, prev - 1))
      }
      // Verwijst de notificatie naar een dossier, dan opent dat — zoals overal in
      // EVA — in een nieuw tabblad; overige bestemmingen in het huidige.
      if (n.url) {
        if (isDossierPad(n.url)) openDossierInNieuwTabblad(n.url)
        else router.push(n.url)
      }
    })
  }

  function handleAllesGelezen() {
    startTransition(async () => {
      await markeerAlleAlsGelezen()
      setNotificaties(prev => prev.map(x => ({ ...x, gelezen: true })))
      setOngelezen(0)
    })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          position: 'relative',
          width: 34, height: 34,
          background: 'transparent',
          border: `1px solid ${open ? 'var(--border)' : 'transparent'}`,
          borderRadius: 8,
          color: 'var(--fg-soft)',
          cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}
        title="Notificaties"
      >
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9.6a6 6 0 0 1 12 0v4.8l1.8 3H4.2l1.8-3V9.6ZM9.6 19.2a2.4 2.4 0 0 0 4.8 0"/>
        </svg>
        {ongelezen > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 7,
            width: 8, height: 8, borderRadius: '50%',
            background: '#ef4444',
            fontSize: 9, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700,
          }}>
            {ongelezen > 9 ? '9+' : ongelezen}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 360, maxHeight: 480,
          background: 'var(--bg-elev, white)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 500,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
              Notificaties {ongelezen > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: '#ef4444', color: 'white',
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  {ongelezen}
                </span>
              )}
            </span>
            {ongelezen > 0 && (
              <button
                type="button"
                onClick={handleAllesGelezen}
                disabled={pending}
                style={{
                  fontSize: 11, color: '#009439', background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Alles gelezen
              </button>
            )}
          </div>

          {/* Lijst */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!geladen && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                Laden...
              </div>
            )}
            {geladen && notificaties.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                Geen meldingen
              </div>
            )}
            {notificaties.map(n => (
              <div
                key={n.id}
                onClick={() => handleKlik(n)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: n.url ? 'pointer' : 'default',
                  background: n.gelezen ? 'transparent' : 'rgba(0,148,57,0.04)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (n.url) (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.gelezen ? 'transparent' : 'rgba(0,148,57,0.04)' }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.2 }}>
                  {TYPE_ICOON[n.type] ?? '🔔'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.gelezen ? 500 : 700, color: 'var(--fg)', lineHeight: 1.3 }}>
                    {n.titel}
                  </div>
                  {(n.dossier_naam ?? n.body) && (
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-soft)', marginTop: 2, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {n.dossier_naam ?? n.body}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 4 }}>
                    {datumTijd(n.aangemaakt_op)}
                  </div>
                </div>
                {!n.gelezen && (
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#009439', flexShrink: 0, marginTop: 5,
                  }}/>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
