'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markeerAlsGelezen,
  markeerAlleAlsGelezen,
  type Notificatie,
} from '@/app/(platform)/notificaties/actions'

/**
 * Meldingenlijst voor EVA Mobiel.
 *
 * Bewust een volledig scherm en geen uitklapper zoals op de desktop: op een
 * telefoon is een paneel van 360 breed dat over de pagina hangt onhandig, en je
 * komt hier binnen vanaf het belletje in de bovenbalk — dan mag het scherm ook
 * gewoon het scherm zijn.
 */

const TYPE_ICOON: Record<string, string> = {
  formulier_taak:      '📋',
  formulier_ingediend: '✅',
  algemeen:            '🔔',
  debiteur:            '💶',
}

function datumTijd(iso: string): string {
  const d = new Date(iso)
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  const tijd  = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${datum} · ${tijd}`
}

export default function MobielNotificatieLijst({ initieel }: { initieel: Notificatie[] }) {
  const router = useRouter()
  const [items, setItems] = useState<Notificatie[]>(initieel)
  const [bezig, startTransition] = useTransition()

  const ongelezen = items.filter(n => !n.gelezen).length

  function openen(n: Notificatie) {
    // Meteen in beeld afvinken: op een trage verbinding wil je niet dat de melding
    // nog vet staat terwijl het volgende scherm al laadt.
    if (!n.gelezen) setItems(prev => prev.map(x => (x.id === n.id ? { ...x, gelezen: true } : x)))
    startTransition(async () => {
      if (!n.gelezen) await markeerAlsGelezen(n.id)
      if (n.url) router.push(n.url)
      else router.refresh()
    })
  }

  function allesGelezen() {
    setItems(prev => prev.map(x => ({ ...x, gelezen: true })))
    startTransition(async () => {
      await markeerAlleAlsGelezen()
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '56px 16px', fontSize: 14 }}>
        Je hebt geen meldingen.
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ongelezen > 0 && (
        <button
          type="button"
          onClick={allesGelezen}
          disabled={bezig}
          style={{
            alignSelf: 'flex-end',
            padding: '8px 14px', borderRadius: 10,
            background: 'transparent', color: '#009439',
            border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Alles gelezen
        </button>
      )}

      {items.map(n => (
        <button
          key={n.id}
          type="button"
          onClick={() => openen(n)}
          style={{
            textAlign: 'left', width: '100%',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: 14,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            // Groene rand links zolang de melding ongelezen is — op een telefoon
            // scan je de lijst, en dat leest sneller dan vet lettertype alleen.
            borderLeft: n.gelezen ? '1px solid var(--border)' : '3px solid #009439',
            borderRadius: 14,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.15 }}>
            {TYPE_ICOON[n.type] ?? '🔔'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14.5, fontWeight: n.gelezen ? 500 : 700,
              color: 'var(--fg)', lineHeight: 1.35,
            }}>
              {n.titel}
            </div>
            {(n.dossier_naam ?? n.body) && (
              <div style={{
                fontSize: 13, color: '#6b757c', marginTop: 4, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>
                {n.dossier_naam ?? n.body}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: '#8b9499', marginTop: 6 }}>
              {datumTijd(n.aangemaakt_op)}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
