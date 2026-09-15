import React from 'react'
import Link from 'next/link'
import SituatieIcoon from '../SituatieIcoon'

/**
 * Eén kaart uit "Wat te doen bij…".
 *
 * Het icoon komt uit de gedeelde lijst in `SituatieIcoon`, zodat het beheer
 * niets kan kiezen wat hier een vraagteken wordt.
 */
export default function SituatieKaart({
  slug, titel, icoon,
}: {
  slug: string
  titel: string
  icoon: string | null
}) {
  return (
    <Link
      href={`/m/handboek/situatie/${slug}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '13px 12px', borderRadius: 12,
        background: 'var(--bg-elev)', border: '1px solid var(--border)',
        textDecoration: 'none', color: 'var(--fg)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,148,57,.12)', color: '#009439',
        }}
      >
        <SituatieIcoon naam={icoon} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{titel}</span>
    </Link>
  )
}
