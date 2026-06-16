'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormInzending, FormInzendingStatus } from '../types'
import { INZENDING_STATUS_LABELS } from '../types'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'

type Props = {
  templateId: string
  inzendingen: FormInzending[]
}

const STATUS_COLORS: Record<FormInzendingStatus, { bg: string; color: string }> = {
  concept:     { bg: '#f3f4f6', color: '#6b7280' },
  ingediend:   { bg: '#dbeafe', color: '#1d4ed8' },
  goedgekeurd: { bg: '#dcfce7', color: '#16a34a' },
  afgekeurd:   { bg: '#fee2e2', color: '#dc2626' },
}

export default function SubmissionsTable({ templateId, inzendingen }: Props) {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [zoek, setZoek] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('alle')
  const [sortering, setSortering] = useState<'nieuwst' | 'oudst'>('nieuwst')

  const gefilterd = useMemo(() => {
    return inzendingen
      .filter(i => {
        if (statusFilter !== 'alle' && i.status !== statusFilter) return false
        if (zoek) {
          const q = zoek.toLowerCase()
          if (i.id.toLowerCase().includes(q)) return true
          if (i.project_ref?.toLowerCase().includes(q)) return true
          return false
        }
        return true
      })
      .sort((a, b) => {
        const da = new Date(a.aangemaakt_op).getTime()
        const db = new Date(b.aangemaakt_op).getTime()
        return sortering === 'nieuwst' ? db - da : da - db
      })
  }, [inzendingen, zoek, statusFilter, sortering])

  function formatDatum(iso: string) {
    try {
      return format(new Date(iso), 'd MMM yyyy HH:mm', { locale: nl })
    } catch {
      return iso
    }
  }

  return (
    <div>
      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <input
          type="search"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoeken..."
          style={{
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
            outline: 'none', width: 220,
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
            outline: 'none',
          }}
        >
          <option value="alle">Alle statussen</option>
          {(Object.entries(INZENDING_STATUS_LABELS) as [FormInzendingStatus, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={sortering}
          onChange={e => setSortering(e.target.value as 'nieuwst' | 'oudst')}
          style={{
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
            outline: 'none',
          }}
        >
          <option value="nieuwst">Nieuwste eerst</option>
          <option value="oudst">Oudste eerst</option>
        </select>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {gefilterd.length} {gefilterd.length === 1 ? 'inzending' : 'inzendingen'}
        </span>
      </div>

      {/* Table */}
      {gefilterd.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 14,
        }}>
          Geen inzendingen gevonden.
        </div>
      ) : isMobile ? (
        /* ── Mobiel: kaartweergave ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gefilterd.map(inz => {
            const colors = STATUS_COLORS[inz.status] ?? STATUS_COLORS.concept
            return (
              <div
                key={inz.id}
                onClick={() => router.push(`/formulieren/${templateId}/inzendingen/${inz.id}`)}
                style={{
                  display: 'block', cursor: 'pointer',
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: 'var(--surface)', padding: 12, color: 'var(--text)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                    fontSize: 11, fontWeight: 600, background: colors.bg, color: colors.color,
                  }}>
                    {INZENDING_STATUS_LABELS[inz.status]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    v{(inz.versie as { versienummer: number } | undefined)?.versienummer ?? '?'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {inz.project_ref ?? 'Zonder project'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Aangemaakt {formatDatum(inz.aangemaakt_op)}
                  {inz.ingediend_op && ` · Ingediend ${formatDatum(inz.ingediend_op)}`}
                </div>
                {inz.status !== 'concept' && (
                  <a
                    href={`/formulieren/${templateId}/inzendingen/${inz.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
                      minHeight: 'var(--touch-target)',
                      color: '#009439', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    PDF downloaden
                  </a>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Aangemaakt</th>
                <th style={thStyle}>Ingediend</th>
                <th style={thStyle}>Versie</th>
                <th style={thStyle}>Project</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map((inz, i) => {
                const colors = STATUS_COLORS[inz.status] ?? STATUS_COLORS.concept
                return (
                  <tr
                    key={inz.id}
                    style={{
                      borderBottom: i < gefilterd.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2, #f9fafb)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px', borderRadius: 10,
                        fontSize: 11, fontWeight: 600,
                        background: colors.bg, color: colors.color,
                      }}>
                        {INZENDING_STATUS_LABELS[inz.status]}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {formatDatum(inz.aangemaakt_op)}
                    </td>
                    <td style={tdStyle}>
                      {inz.ingediend_op ? formatDatum(inz.ingediend_op) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        v{(inz.versie as { versienummer: number } | undefined)?.versienummer ?? '?'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {inz.project_ref ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                          href={`/formulieren/${templateId}/inzendingen/${inz.id}`}
                          style={{ color: '#009439', textDecoration: 'none', fontSize: 12 }}
                          title="Bekijken"
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </Link>
                        {inz.status !== 'concept' && (
                          <a
                            href={`/formulieren/${templateId}/inzendingen/${inz.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 12 }}
                            title="PDF downloaden"
                          >
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text)',
}
