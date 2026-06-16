import React from 'react'
import Link from 'next/link'

/**
 * Mobiele scherm-header (DS "AppHeader"): polygon-achtergrond + donkere scrim,
 * 62px top-padding voor de iOS-statusbar, witte titel (800/-0.02em) + optionele
 * subtitel en terug-link. Per scherm gerenderd; de bottom-nav zit in de layout.
 */
export default function AppHeader({
  title, sub, backHref,
}: {
  title: string
  sub?: string
  backHref?: string
}) {
  return (
    <div
      style={{
        backgroundImage: 'url("/polygon-bg.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        paddingTop: 'max(62px, env(safe-area-inset-top))',
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: backHref ? 16 : 20,
        color: '#fff',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Donkere scrim voor leesbaarheid */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(160deg,rgba(0,0,0,.18) 0%,rgba(1,42,21,.55) 100%)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {backHref && (
          <Link
            href={backHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'rgba(255,255,255,.9)', fontSize: 14, fontWeight: 600,
              textDecoration: 'none', marginBottom: 10, lineHeight: 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Terug
          </Link>
        )}
        <div style={{ fontSize: backHref ? 18 : 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12, opacity: 0.82, marginTop: 3, fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  )
}
