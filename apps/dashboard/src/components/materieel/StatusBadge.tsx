'use client'
import React from 'react'
import { STATUS_META, type MaterieelStatus } from '@/lib/materieel/types'

/** Statuspil met gekleurde punt — spiegelt de stoplicht-statussen uit het ontwerp. */
export default function StatusBadge({ status }: { status: MaterieelStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 10px', borderRadius: 999,
        fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
        color: meta.kleur,
        background: `color-mix(in srgb, ${meta.kleur} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.kleur} 30%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.kleur, flexShrink: 0 }} />
      {meta.label}
    </span>
  )
}
