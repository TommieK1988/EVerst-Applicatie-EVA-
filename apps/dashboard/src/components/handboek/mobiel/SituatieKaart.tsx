import React from 'react'
import Link from 'next/link'
import {
  HeartPulse, TriangleAlert, Flame, Shirt, Palmtree, Wrench, Users, Hammer, Car,
  Smartphone, CircleHelp, type LucideIcon,
} from 'lucide-react'

/**
 * Eén kaart uit "Wat te doen bij…".
 *
 * De iconen staan hier als expliciete map en niet als dynamische import uit
 * lucide: dan zou de hele iconenbibliotheek in de bundel belanden voor tien
 * plaatjes. Een naam die hier niet in staat valt terug op een vraagteken —
 * beter dan een lege plek als HR een situatie toevoegt.
 */
const ICONEN: Record<string, LucideIcon> = {
  HeartPulse, TriangleAlert, Flame, Shirt, Palmtree, Wrench, Users, Hammer, Car, Smartphone,
}

export default function SituatieKaart({
  slug, titel, icoon,
}: {
  slug: string
  titel: string
  icoon: string | null
}) {
  const Icon = (icoon && ICONEN[icoon]) || CircleHelp
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
        <Icon size={19} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{titel}</span>
    </Link>
  )
}
