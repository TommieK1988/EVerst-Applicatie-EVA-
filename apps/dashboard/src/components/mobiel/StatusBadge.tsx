import React from 'react'

/**
 * DS-statusbadge: pill met kleur-dot + label (nooit alleen kleur). Generiek —
 * label en kleur worden door de aanroeper bepaald (bijv. dossier-substatus).
 */
export default function StatusBadge({
  label, color, lg = false,
}: {
  label: string
  color: string
  lg?: boolean
}) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 99,
        padding: lg ? '5px 12px' : '3px 9px',
        fontSize: lg ? 13 : 11,
        fontWeight: 700,
      }}
    >
      <span style={{ width: lg ? 7 : 6, height: lg ? 7 : 6, borderRadius: '50%', background: color, display: 'block', flexShrink: 0 }} />
      {label}
    </span>
  )
}
