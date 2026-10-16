'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check } from 'lucide-react'

/**
 * Losse onderdelen van het fiatteerscherm (`KeurenClient`): de lege/fout-melding en de vinkjes.
 * Apart gezet zodat `KeurenClient` onder de 800 regels blijft. De kosten staan in `KostenKeuren`.
 */

export const GROEN = '#009439'
export const GRIJS = '#6b757c'
export const ZACHT = '#9aa4ab'
export const ORANJE = '#b85a00'

export function Melding({ titel, tekst }: { titel: string; tekst: string }) {
  const t = useTranslations('uren')
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>
        {titel}
      </div>
      <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5 }}>{tekst}</div>
      <Link
        href="/m/uren"
        style={{
          display: 'inline-block', marginTop: 20, fontSize: 13,
          fontWeight: 600, color: GROEN, textDecoration: 'none',
        }}
      >
        {t('keuren.naarWeekstaat')}
      </Link>
    </div>
  )
}

export function Vinkje({ aan }: { aan: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
        border: aan ? `2px solid ${GROEN}` : '2px solid var(--border)',
        background: aan ? GROEN : 'transparent',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}
    >
      {aan && <Check size={14} strokeWidth={3} />}
    </span>
  )
}

/** Een regel die niet aan kán: er ontbreekt een bewakingscode. */
export function Waarschuwing() {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
        border: `2px solid ${ORANJE}`, color: ORANJE,
        display: 'grid', placeItems: 'center',
      }}
    >
      <AlertTriangle size={13} strokeWidth={2.6} />
    </span>
  )
}
