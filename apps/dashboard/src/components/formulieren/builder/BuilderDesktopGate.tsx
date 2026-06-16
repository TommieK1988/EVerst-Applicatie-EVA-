'use client'
import React from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'

/**
 * De formulier-builder (3-panel drag-drop) is desktop-werk en wordt op mobiel
 * bewust niet getoond. Invullen en inzendingen bekijken kan wél op mobiel.
 * Gate de builder-UI hierachter zodat telefoon/tablet-portret een nette uitleg
 * krijgen i.p.v. een onbruikbare layout.
 */
export default function BuilderDesktopGate({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: 12, padding: '32px 20px',
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Ontwerpen kan op desktop
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
          Formulieren ontwerpen werkt op een groter scherm. Op telefoon en tablet
          kun je formulieren wél invullen en inzendingen bekijken.
        </p>
        <Link
          href="/formulieren/sjablonen"
          style={{
            marginTop: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 'var(--touch-target)', padding: '0 18px', borderRadius: 8,
            background: 'var(--brand-500)', color: 'white', fontSize: 14, fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Terug naar formulieren
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
