import React from 'react'
import Link from 'next/link'

/**
 * Mobiele scherm-header (DS "AppHeader"): polygon-achtergrond + donkere scrim,
 * witte titel (800/-0.02em) + optionele subtitel en terug-link.
 *
 * Bewust compact gehouden: op een telefoon is verticale ruimte schaars en de
 * header mag niet meer wegnemen dan nodig. De top-padding houdt rekening met de
 * statusbalk (`env(safe-area-inset-top)`), met een ondergrens voor toestellen
 * die die waarde niet leveren.
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
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: backHref ? 12 : 14,
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
              textDecoration: 'none', marginBottom: 8, lineHeight: 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Terug
          </Link>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Klein vol-wit beeldmerk naast de titel. Asset is wit-E met groene
              gradient; brightness(0) invert(1) maakt 'm egaal wit. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-beeldmerk.svg"
            alt=""
            aria-hidden
            style={{ height: backHref ? 19 : 22, width: 'auto', flexShrink: 0, filter: 'brightness(0) invert(1)' }}
          />
          <div style={{ fontSize: backHref ? 17 : 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {title}
          </div>
        </div>
        {sub && <div style={{ fontSize: 12, opacity: 0.82, marginTop: 3, fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  )
}
