import type { Metadata } from 'next'
import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFormInzending, getFormTemplate } from '../../../actions'
import { INZENDING_STATUS_LABELS } from '@/components/formulieren/types'
import type { FormField } from '@/components/formulieren/types'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Inzending bekijken' }

function formatValue(field: FormField, value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Niet ingevuld</span>
  }

  if (field.type === 'photo' && Array.isArray(value)) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {(value as string[]).map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={url} alt={`Foto ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}/>
        ))}
      </div>
    )
  }

  if (field.type === 'signature' && typeof value === 'string') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="Handtekening" style={{ maxWidth: 280, border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }}/>
  }

  if (field.type === 'boolean') {
    return <span>{value === true ? 'Ja' : 'Nee'}</span>
  }

  if (field.type === 'checkbox' && Array.isArray(value)) {
    const selected = value as string[]
    const labels = (field.options ?? [])
      .filter(o => selected.includes(o.value))
      .map(o => o.label)
    return <span>{labels.join(', ') || '—'}</span>
  }

  if (field.type === 'location' && typeof value === 'object' && value !== null) {
    const loc = value as { lat: number; lng: number; adres?: string }
    return <span>📍 {loc.adres ?? `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`}</span>
  }

  if (field.type === 'repeatable' && Array.isArray(value)) {
    return (
      <div style={{ marginTop: 8 }}>
        {(value as Record<string, unknown>[]).map((row, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Rij {i + 1}</span>
            {(field.children ?? []).map(child => (
              <div key={child.id} style={{ marginTop: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{child.label}: </span>
                <span style={{ fontSize: 12 }}>{String(row[child.id] ?? '—')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return <span>{String(value)}</span>
}

export default async function InzendingDetailPage({
  params,
}: {
  params: Promise<{ id: string; subId: string }>
}) {
  const { id, subId } = await params
  const [templateResult, inzendingResult] = await Promise.all([
    getFormTemplate(id),
    getFormInzending(subId),
  ])

  if (!templateResult.ok || !inzendingResult.ok) notFound()

  const template  = templateResult.data
  const inzending = inzendingResult.data
  const versie    = inzending.versie as { schema: { fields: FormField[] } } | undefined
  const fields    = versie?.schema?.fields ?? []
  const waarden   = inzending.waarden

  const statusLabels = INZENDING_STATUS_LABELS
  const s = inzending.status

  const statusColors: Record<string, { bg: string; color: string }> = {
    concept:     { bg: '#fef9c3', color: '#854d0e' },
    ingediend:   { bg: '#dbeafe', color: '#1d4ed8' },
    goedgekeurd: { bg: '#dcfce7', color: '#16a34a' },
    afgekeurd:   { bg: '#fee2e2', color: '#dc2626' },
  }
  const sc = statusColors[s] ?? statusColors.concept

  return (
    <div style={{ padding: '32px', maxWidth: 760 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13 }}>
        <Link href="/formulieren" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Formulieren</Link>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <Link href={`/formulieren/${id}/inzendingen`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{template.naam}</Link>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span style={{ color: 'var(--text)' }}>Inzending</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{template.naam}</h1>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>Aangemaakt: {format(new Date(inzending.aangemaakt_op), 'd MMMM yyyy HH:mm', { locale: nl })}</span>
            {inzending.ingediend_op && (
              <span>Ingediend: {format(new Date(inzending.ingediend_op), 'd MMMM yyyy HH:mm', { locale: nl })}</span>
            )}
          </div>
        </div>
        <span style={{
          padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: sc.bg, color: sc.color,
        }}>
          {statusLabels[s]}
        </span>
      </div>

      {/* Values */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {fields.filter(f => f.type !== 'divider').map((field, i) => (
          <div
            key={field.id}
            style={{
              padding: '14px 18px',
              borderBottom: i < fields.length - 2 ? '1px solid var(--border)' : 'none',
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', paddingTop: 2 }}>
              {field.label}
              {field.type === 'heading' || field.type === 'paragraph' ? null : null}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>
              {formatValue(field, waarden[field.id])}
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: 14 }}>
            Geen velden beschikbaar.
          </div>
        )}
      </div>

      {/* PDF download */}
      <div style={{ marginTop: 24 }}>
        <a
          href={`/formulieren/${id}/inzendingen/${subId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13, textDecoration: 'none',
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Downloaden als PDF
        </a>
      </div>
    </div>
  )
}
