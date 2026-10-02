'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'

/**
 * De bewakingscode van een planning-activiteit, zo dat een medewerker hem kan overnemen in zijn
 * weekstaat. De code zelf blijft altijd letterlijk (die tik je over); alleen de omschrijving
 * van kantoor gaat door de vertaling.
 *
 * `compact` is voor de labelkolom van de balkenweergave: alleen de code, op één regel.
 */
export default function BewakingscodeLabel({ code, naam, compact }: {
  code: string
  naam: string | null
  compact?: boolean
}) {
  const t = useTranslations('dossiertabs.planning')
  const badge = (
    <span
      title={t('bewakingscode')}
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: compact ? 9.5 : 12, fontWeight: 700, color: '#161b20',
        background: '#eef2f3', border: '1px solid #e3e8ea', borderRadius: 4,
        padding: compact ? '0 4px' : '1px 6px', whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
  if (compact) return badge

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
        {t('code')}
      </span>
      {badge}
      {naam && (
        <VertaalbareTekst
          tekst={naam}
          label={false}
          style={{ fontSize: 12, color: '#6b757c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        />
      )}
    </div>
  )
}
