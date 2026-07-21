import React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

/**
 * Eén tegel op het mobiele grid-startscherm (`MobielHome`). Groot touch-doel
 * (vierkant), wit vlak met icoon-in-cirkel + label. Optioneel een teller-badge
 * (bijv. open acties) rechtsboven. `external` rendert een `<a target=_blank>`
 * i.p.v. een client-side `<Link>` (voor bijv. een losse deployment).
 */
export default function MobielTegel({
  href, label, Icon, badge, external,
}: {
  href: string
  label: string
  Icon: LucideIcon
  badge?: number | null
  external?: boolean
}) {
  const style: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    aspectRatio: '1 / 1',
    background: 'var(--neutral-0, #fff)',
    border: '1px solid var(--neutral-200, #e3e8ea)',
    borderRadius: 16,
    textDecoration: 'none',
    color: 'var(--neutral-900, #161b20)',
    WebkitTapHighlightColor: 'transparent',
    boxShadow: '0 1px 2px rgba(16,24,40,.04)',
  }

  const inner = (
    <>
      {badge != null && badge > 0 && (
        <span
          style={{
            position: 'absolute', top: 10, right: 10,
            minWidth: 20, height: 20, padding: '0 6px',
            borderRadius: 999, background: '#009439', color: '#fff',
            fontSize: 11, fontWeight: 700, lineHeight: '20px', textAlign: 'center',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span
        aria-hidden
        style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(0,148,57,.10)', color: '#009439',
          display: 'grid', placeItems: 'center',
        }}
      >
        <Icon size={26} strokeWidth={1.9} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', textAlign: 'center' }}>
        {label}
      </span>
    </>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} style={style}>
      {inner}
    </Link>
  )
}
