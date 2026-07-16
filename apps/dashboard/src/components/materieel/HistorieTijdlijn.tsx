'use client'

import React from 'react'
import { HISTORIE_SOORT_LABELS, type HistorieItem } from '@/lib/materieel/types'

const FILTERS: { key: 'alles' | HistorieItem['soort']; label: string }[] = [
  { key: 'alles', label: 'Alles' },
  { key: 'overdracht', label: 'Overdrachten' },
  { key: 'keuring', label: 'Keuringen' },
  { key: 'onderhoud', label: 'Onderhoud' },
  { key: 'controle', label: 'Controles' },
  { key: 'scan', label: 'Scans' },
]

function datumTijd(v: string): string {
  const d = new Date(v)
  // Datum-only waarden (keuring/onderhoud/controle) hebben geen zinvolle tijd.
  const heeftTijd = v.includes('T')
  return heeftTijd
    ? d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function HistorieTijdlijn({ items }: { items: HistorieItem[] }) {
  const [filter, setFilter] = React.useState<'alles' | HistorieItem['soort']>('alles')

  // Alleen filters tonen waar ook echt iets voor is.
  const beschikbaar = FILTERS.filter((f) => f.key === 'alles' || items.some((i) => i.soort === f.key))
  const zichtbaar = filter === 'alles' ? items : items.filter((i) => i.soort === filter)

  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '6px 0' }}>Nog geen historie.</p>
  }

  return (
    <div>
      {beschikbaar.length > 2 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {beschikbaar.map((f) => {
            const actief = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600,
                  border: `1px solid ${actief ? 'var(--brand-500, var(--accent))' : 'var(--border)'}`,
                  background: actief ? 'var(--brand-50, var(--bg-subtle))' : 'var(--bg)',
                  color: actief ? 'var(--brand-700, var(--accent))' : 'var(--fg-soft)',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {/* Verticale lijn door de tijdlijn */}
        <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: 'var(--border)' }} />

        {zichtbaar.map((i) => (
          <div key={i.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
            <span style={{
              width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 3,
              background: i.kleur, border: '2px solid var(--bg)', zIndex: 1,
            }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{i.titel}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: i.kleur, background: `color-mix(in srgb, ${i.kleur} 12%, transparent)`,
                  padding: '1px 6px', borderRadius: 4,
                }}>
                  {HISTORIE_SOORT_LABELS[i.soort]}
                </span>
              </div>
              {i.detail && (
                <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 2 }}>{i.detail}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                {datumTijd(i.wanneer)}{i.door ? ` · door ${i.door}` : ''}
              </div>
            </div>
          </div>
        ))}

        {zichtbaar.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '6px 0 6px 23px' }}>
            Niets gevonden voor dit filter.
          </p>
        )}
      </div>
    </div>
  )
}
