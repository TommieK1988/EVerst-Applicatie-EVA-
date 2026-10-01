import React from 'react'

const HERO_BG =
  "url(\"/polygon-bg.png\"), linear-gradient(160deg, #009439 0%, #054f2e 100%)"

/**
 * Het scherm rond "kies een wachtwoord": gedeeld door /wachtwoord-instellen (na een sessie)
 * en /auth/activeren (met een activatielink, zonder sessie).
 */
export default function WachtwoordKader({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div
      className="eva"
      data-theme="light"
      style={{
        display: 'flex', flexDirection: 'column', minHeight: '100dvh',
        background: 'var(--neutral-0, #fff)',
        fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{
        backgroundImage: HERO_BG, backgroundSize: 'cover', backgroundPosition: 'center',
        padding: 'calc(48px + env(safe-area-inset-top, 0px)) 28px 40px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          fontWeight: 800, fontSize: 30, letterSpacing: '0.06em', color: 'white',
          textShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>EVERTS.</div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>EVA · Mobiel</div>
      </div>

      <div style={{ flex: 1, padding: '32px 24px calc(28px + env(safe-area-inset-bottom, 0px))' }}>
        <h1 style={{
          margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
          color: 'var(--neutral-900, #161b20)',
        }}>{titel}</h1>
        {children}
      </div>
    </div>
  )
}

export function KaderUitleg({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: '8px 0 24px', fontSize: 14, lineHeight: 1.5,
      color: 'var(--neutral-500, #6b757c)',
    }}>{children}</p>
  )
}

export function KaderFout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 20, padding: '14px 16px',
      background: '#fff2f0', border: '1px solid #ffc9c0',
      borderRadius: 10, fontSize: 14, lineHeight: 1.5, color: '#c0392b',
    }}>{children}</div>
  )
}
