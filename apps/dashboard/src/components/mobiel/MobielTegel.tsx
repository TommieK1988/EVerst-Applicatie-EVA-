import React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

/**
 * Eén tegel op het mobiele grid-startscherm (`MobielHome`). Wit vlak met
 * icoon-in-cirkel + label, optioneel een teller-badge (bijv. open acties)
 * rechtsboven. `external` rendert een `<a target=_blank>` i.p.v. een client-side
 * `<Link>` (voor bijv. een losse deployment).
 *
 * MAATVOERING — het grid staat op drie kolommen, dus een tegel is ongeveer een
 * derde van de schermbreedte (~108px op een iPhone). Bewust géén `aspectRatio: 1`
 * meer: vierkant zou de tegel even veel korter maken als hij smaller werd, en dan
 * krijgt een label van twee woorden het niet meer droog. Een vaste minimumhoogte
 * houdt de rij rustig én houdt het trefgebied ruim boven de 44px die Apple als
 * ondergrens aanhoudt.
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
    gap: 8,
    minHeight: 96,
    padding: '14px 6px 12px',
    background: 'var(--neutral-0, #fff)',
    border: '1px solid var(--border)',
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
            position: 'absolute', top: 7, right: 7,
            minWidth: 19, height: 19, padding: '0 5px',
            borderRadius: 999, background: '#009439', color: '#fff',
            fontSize: 11, fontWeight: 700, lineHeight: '19px', textAlign: 'center',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span
        aria-hidden
        style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(0,148,57,.10)', color: '#009439',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}
      >
        <Icon size={21} strokeWidth={1.9} />
      </span>
      {/* Breekt bij een lang label netjes over twee regels i.p.v. de tegel op te rekken. */}
      <span style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', textAlign: 'center',
        lineHeight: 1.25, hyphens: 'auto',
      }}>
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
