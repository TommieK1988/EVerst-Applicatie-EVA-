'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import StatusBadge from './StatusBadge'

export type MobielDossier = {
  id: string
  titel: string
  dossiernummer: string | null
  klant_naam: string | null
  projectleider_naam: string | null
  groep: 'aanvraag' | 'opdracht' | 'servicedesk'
  statusLabel: string
  statusColor: string
}

const SLICER: { key: string; label: string }[] = [
  { key: 'alle',        label: 'Alle' },
  { key: 'aanvraag',    label: 'Aanvragen' },
  { key: 'opdracht',    label: 'Opdrachten' },
  { key: 'servicedesk', label: 'Servicedesk' },
]

export default function MobielDossierLijst({ dossiers }: { dossiers: MobielDossier[] }) {
  const [filter, setFilter] = useState('alle')
  const gefilterd = filter === 'alle' ? dossiers : dossiers.filter(d => d.groep === filter)

  return (
    <>
      {/* Slicer op hoofdstatus */}
      <div
        style={{
          display: 'flex', gap: 5, padding: '10px 14px 8px',
          background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
          overflowX: 'auto', flexShrink: 0,
        }}
      >
        {SLICER.map(s => {
          const actief = filter === s.key
          const aantal = s.key === 'alle' ? dossiers.length : dossiers.filter(d => d.groep === s.key).length
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              style={{
                height: 30, padding: '0 11px', borderRadius: 99, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                background: actief ? '#009439' : '#f1f4f5',
                color: actief ? '#fff' : '#6b757c',
                transition: 'all 120ms', whiteSpace: 'nowrap',
              }}
            >
              {s.label}{aantal > 0 ? ` ${aantal}` : ''}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gefilterd.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 0', fontSize: 14 }}>
            Geen dossiers
          </div>
        )}
        {gefilterd.map(d => (
          <Link
            key={d.id}
            href={`/m/dossiers/${d.id}`}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: 14, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 7 }}>
                <StatusBadge label={d.statusLabel} color={d.statusColor} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.titel}
              </div>
              {d.klant_naam && (
                <div style={{ fontSize: 12, color: '#6b757c', marginBottom: 3 }}>{d.klant_naam}</div>
              )}
              {d.projectleider_naam && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#009439' }}>{d.projectleider_naam}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {d.dossiernummer && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: '#9aa4ab' }}>{d.dossiernummer}</span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
