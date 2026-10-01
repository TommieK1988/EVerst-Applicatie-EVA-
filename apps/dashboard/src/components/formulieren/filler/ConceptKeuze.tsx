'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl, pl, ta } from 'date-fns/locale'
import { useTranslations } from 'next-intl'
import { useTaal } from '@/i18n/client'
import type { FormInzending } from '../types'

type Props = {
  templateId: string
  templateNaam: string
  dossierId: string
  concepten: Pick<FormInzending, 'id' | 'aangemaakt_op'>[]
}

/**
 * Keuzescherm bij het invullen van een formulier op een dossier waarvoor al
 * één of meer concepten bestaan. De gebruiker kiest bewust: een bestaand
 * concept hervatten of een nieuw, leeg exemplaar toevoegen. Meerdere
 * exemplaren van hetzelfde sjabloon op één dossier zijn toegestaan.
 */
export default function ConceptKeuze({ templateId, templateNaam, dossierId, concepten }: Props) {
  const router = useRouter()
  const t = useTranslations('formulieren')
  const taal = useTaal()
  const dfLocale = taal === 'pl' ? pl : taal === 'ta' ? ta : nl

  function hervat(inzendingId: string) {
    router.push(`/formulieren/${templateId}/invullen?dossier_id=${dossierId}&inzending_id=${inzendingId}`)
  }

  function nieuw() {
    router.push(`/formulieren/${templateId}/invullen?dossier_id=${dossierId}&new=${crypto.randomUUID()}`)
  }

  function formatDatum(iso: string) {
    try {
      const d = new Date(iso)
      return t('conceptKeuze.laatstOpgeslagen', { datum: format(d, 'd MMM yyyy', { locale: dfLocale }), tijd: format(d, 'HH:mm') })
    } catch { return '—' }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
        {templateNaam}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        {t('conceptKeuze.uitleg', { aantal: concepten.length })}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {concepten.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => hervat(c.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('conceptKeuze.hervatten')}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {formatDatum(c.aangemaakt_op)}
              </span>
            </span>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={nieuw}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 18px', borderRadius: 9, border: 'none',
          background: 'hsl(var(--primary))', color: 'white',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M12 5v14M5 12h14"/>
        </svg>
        {t('conceptKeuze.nieuw')}
      </button>
    </div>
  )
}
