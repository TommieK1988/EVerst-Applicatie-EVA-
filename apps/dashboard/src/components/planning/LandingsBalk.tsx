'use client'

import { Copy } from 'lucide-react'

/**
 * Gestippelde schaduwbalk op de plek waar het gesleepte planitem terechtkomt:
 * de juiste rij, startdag en lengte, met de periode erin.
 */
export default function LandingsBalk({
  left, width, top, hoogte, kleur, periode, kopie,
}: {
  left:    number
  width:   number
  top:     number
  hoogte:  number
  kleur:   string
  periode: string
  kopie:   boolean
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top, height: hoogte,
        left, width: Math.max(0, width - 2),
        borderRadius: 5,
        border: `2px dashed ${kleur}`,
        background: `color-mix(in srgb, ${kleur} 18%, transparent)`,
        boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: 6,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {kopie && <Copy size={10} color={kleur} style={{ flexShrink: 0 }} />}
      {width > 48 && (
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
          color: kleur, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {periode}
        </span>
      )}
    </div>
  )
}
