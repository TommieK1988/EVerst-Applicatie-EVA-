'use client'
import React from 'react'
import Link from 'next/link'

/**
 * Nette melding voor schermen die (nog) niet voor mobiel zijn gebouwd.
 * Onderdeel van de "gerichte mobiele ingang": buitendienst belandt zo niet
 * per ongeluk op een desktop-layout, maar krijgt uitleg + een weg terug.
 */
export default function DesktopOnlyNotice({
  title = 'Dit scherm werkt op desktop',
  description = 'Deze module is nog niet geoptimaliseerd voor telefoon of tablet. Op een groter scherm kun je er wél mee werken. Op mobiel zijn Taken en Formulieren beschikbaar.',
}: {
  title?: string
  description?: string
}) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      gap: 14, padding: '32px 20px',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, display: 'grid', placeItems: 'center',
        background: 'var(--brand-50)', color: 'var(--brand-700)',
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
        {description}
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/taken/overzicht" style={ctaStyle()}>Naar Taken</Link>
        <Link href="/formulieren/overzicht" style={ctaStyle(true)}>Naar Formulieren</Link>
      </div>
    </div>
  )
}

function ctaStyle(secondary = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 'var(--touch-target)', padding: '0 18px', borderRadius: 8,
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    background: secondary ? 'var(--surface, #fff)' : 'var(--brand-500)',
    color: secondary ? 'var(--fg)' : 'white',
    border: secondary ? '1px solid var(--border)' : 'none',
  }
}
