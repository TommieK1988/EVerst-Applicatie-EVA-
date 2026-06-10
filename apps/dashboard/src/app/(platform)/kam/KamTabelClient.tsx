'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import type { KamInzending } from './actions'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const STATUS_STIJL: Record<string, { bg: string; color: string; label: string }> = {
  concept:     { bg: '#f3f4f6', color: '#6b7280', label: 'Concept' },
  ingediend:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Ingediend' },
  goedgekeurd: { bg: '#dcfce7', color: '#16a34a', label: 'Goedgekeurd' },
  afgekeurd:   { bg: '#fee2e2', color: '#dc2626', label: 'Afgekeurd' },
}

type Props = {
  inzendingen: KamInzending[]
  templates: { id: string; naam: string }[]
}

export function KamTabelClient({ inzendingen, templates }: Props) {
  const [statusFilter, setStatusFilter]     = useState('alle')
  const [templateFilter, setTemplateFilter] = useState('alle')
  const [vanFilter, setVanFilter]           = useState('')
  const [totFilter, setTotFilter]           = useState('')
  const [zoek, setZoek]                     = useState('')

  const gefilterd = useMemo(() => {
    return inzendingen.filter(i => {
      if (statusFilter   !== 'alle' && i.status !== statusFilter) return false
      if (templateFilter !== 'alle' && i.template?.naam !== templateFilter) return false
      if (vanFilter && i.aangemaakt_op < vanFilter) return false
      if (totFilter && i.aangemaakt_op > totFilter + 'T23:59:59') return false
      if (zoek) {
        const q = zoek.toLowerCase()
        if (i.template?.naam?.toLowerCase().includes(q)) return true
        if (i.project_ref?.toLowerCase().includes(q)) return true
        if (i.id.includes(q)) return true
        return false
      }
      return true
    })
  }, [inzendingen, statusFilter, templateFilter, vanFilter, totFilter, zoek])

  function exportExcel() {
    const rijen = gefilterd.map(i => ({
      'Formulier':    i.template?.naam ?? '—',
      'Status':       STATUS_STIJL[i.status]?.label ?? i.status,
      'Project ref':  i.project_ref ?? '—',
      'Aangemaakt':   i.aangemaakt_op ? format(new Date(i.aangemaakt_op), 'd MMM yyyy HH:mm', { locale: nl }) : '—',
      'Ingediend op': i.ingediend_op  ? format(new Date(i.ingediend_op),  'd MMM yyyy HH:mm', { locale: nl }) : '—',
      'Versie':       i.versie?.versienummer ?? '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rijen)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'KAM-inzendingen')
    XLSX.writeFile(wb, `kam-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--border)',
    fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
    outline: 'none',
  }

  const uniekTemplates = [...new Set(inzendingen.map(i => i.template?.naam).filter(Boolean))] as string[]

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search" value={zoek} onChange={e => setZoek(e.target.value)}
          placeholder="Zoeken..."
          style={{ ...selectStyle, width: 200 }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="alle">Alle statussen</option>
          {Object.entries(STATUS_STIJL).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={templateFilter} onChange={e => setTemplateFilter(e.target.value)} style={selectStyle}>
          <option value="alle">Alle formulieren</option>
          {uniekTemplates.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="date" value={vanFilter} onChange={e => setVanFilter(e.target.value)} style={selectStyle} title="Vanaf"/>
        <input type="date" value={totFilter} onChange={e => setTotFilter(e.target.value)} style={selectStyle} title="Tot en met"/>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {gefilterd.length} {gefilterd.length === 1 ? 'inzending' : 'inzendingen'}
        </span>
        <button
          type="button" onClick={exportExcel}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Exporteer Excel
        </button>
      </div>

      {/* Tabel */}
      {gefilterd.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Geen inzendingen gevonden.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Status', 'Formulier', 'Datum', 'Ingediend op', 'Project', 'Versie', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gefilterd.map((inz, i) => {
                const s = STATUS_STIJL[inz.status] ?? STATUS_STIJL.concept
                return (
                  <tr key={inz.id} style={{ borderBottom: i < gefilterd.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                      {inz.template?.naam ?? '—'}
                      {inz.template?.categorie && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 8 }}>
                          {inz.template.categorie}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {inz.aangemaakt_op ? format(new Date(inz.aangemaakt_op), 'd MMM yyyy', { locale: nl }) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {inz.ingediend_op ? format(new Date(inz.ingediend_op), 'd MMM yyyy HH:mm', { locale: nl }) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {inz.project_ref ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      v{inz.versie?.versienummer ?? '?'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {inz.template && (
                        <Link
                          href={`/formulieren/${(inz as KamInzending & { template_id: string }).template_id}/inzendingen/${inz.id}`}
                          style={{ color: '#009439', fontSize: 12, textDecoration: 'none' }}
                        >
                          Bekijken →
                        </Link>
                      )}
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
