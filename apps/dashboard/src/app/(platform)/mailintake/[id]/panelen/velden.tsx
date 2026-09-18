'use client'

/**
 * De gedeelde bouwstenen van het behandelscherm: de veldopmaak en het
 * zekerheidsbadge dat achter elk voorgevuld veld staat.
 *
 * Stonden eerder in het behandelscherm zelf, maar de panelen hadden ze allemaal
 * met de hand overgeschreven -- met licht afwijkende randen en kleuren tot gevolg.
 */

import React from 'react'

import { VELD_BETROUWBAAR } from '@/lib/mailintake/types'

export const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
export const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
export const kop = { fontSize: 13, fontWeight: 600, marginBottom: 6 } as const

export const veldStijl: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

/** Percentage-badge achter een veld. Onder de 80% is het nakijken waard. */
export function Zekerheid({ score }: { score: number | undefined }) {
  if (score == null || score === 0) return null
  const pct = Math.round(score * 100)
  const goed = score >= VELD_BETROUWBAAR
  return (
    <span
      title={goed ? 'EVA is hier zeker van' : 'Controleer dit veld'}
      style={{
        ...klein, marginLeft: 6, padding: '1px 5px', borderRadius: 4,
        background: goed ? 'var(--su-100, #dcfce7)' : 'var(--wa-100, #fef3c7)',
        color: goed ? 'var(--su-800, #166534)' : 'var(--wa-800, #92400e)',
      }}
    >
      {pct}%
    </span>
  )
}

export function Veld({
  label, score, children,
}: { label: string; score?: number; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ ...klein, display: 'flex', alignItems: 'center' }}>
        {label}<Zekerheid score={score} />
      </span>
      {children}
    </label>
  )
}
