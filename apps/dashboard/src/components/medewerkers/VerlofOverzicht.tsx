import React from 'react'
import type { MedewerkerAfwezigheid, Bouw7VrijeDag } from '@everts/database/platform-types'
import { medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import { Badge } from '@/components/ui'

/**
 * Read-only verlofoverzicht op de medewerkerkaart: individueel verlof uit
 * medewerker_afwezigheid (Bouw7-sync + handmatige EVA-regels) aangevuld met
 * organisatiebrede vrije dagen (feestdagen/bouwvak) uit bouw7_vrije_dagen.
 * Beheren gebeurt in Planning → Medewerkerplanning.
 */

type Regel = {
  key: string
  start_datum: string
  eind_datum: string
  tijden: string | null
  soort: string
  typeLabel: string
  typeTone: 'info' | 'warning' | 'success' | 'neutral'
  status: string
  bron: 'bouw7' | 'eva' | null
}

// In de live Bouw7-data komt alleen statuscode 0 voor (goedgekeurd/ingepland
// verlof in de kalender). Onbekende codes tonen we als de code zelf.
function statusLabel(code: number | null): string {
  if (code === null) return '—'
  if (code === 0) return 'Goedgekeurd'
  if (code === 1) return 'Aangevraagd'
  return `Status ${code}`
}

const TYPE_TONE: Record<string, Regel['typeTone']> = {
  verlof:   'info',
  ziek:     'warning',
  training: 'success',
  overig:   'neutral',
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function periode(start: string, eind: string): string {
  return start === eind ? formatDatum(start) : `${formatDatum(start)} – ${formatDatum(eind)}`
}

export default function VerlofOverzicht({
  afwezigheid,
  vrijeDagen,
}: {
  afwezigheid: MedewerkerAfwezigheid[]
  vrijeDagen: Bouw7VrijeDag[]
}) {
  const regels: Regel[] = [
    ...afwezigheid.map((a): Regel => ({
      key: `afw-${a.id}`,
      start_datum: a.start_datum,
      eind_datum: a.eind_datum,
      tijden: a.start_tijd && a.eind_tijd ? `${a.start_tijd.slice(0, 5)}–${a.eind_tijd.slice(0, 5)}` : null,
      soort: a.opmerking || medewerkerAfwezigheidLabels[a.type],
      typeLabel: medewerkerAfwezigheidLabels[a.type],
      typeTone: TYPE_TONE[a.type] ?? 'neutral',
      status: a.bron === 'bouw7' ? statusLabel(a.bouw7_status) : '—',
      bron: a.bron,
    })),
    ...vrijeDagen.map((v): Regel => ({
      key: `vrij-${v.id}`,
      start_datum: v.start_datum,
      eind_datum: v.eind_datum,
      tijden: null,
      soort: v.naam || 'Vrije dag',
      typeLabel: 'Feestdag',
      typeTone: 'neutral',
      status: 'Goedgekeurd',
      bron: 'bouw7',
    })),
  ].sort((a, b) => b.start_datum.localeCompare(a.start_datum))

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)',
  }
  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)',
    padding: '7px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, minHeight: 32 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Verlof &amp; afwezigheid
        </h3>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>
          {regels.length} {regels.length === 1 ? 'regel' : 'regels'}
        </span>
      </div>

      {regels.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Geen verlof of afwezigheid geregistreerd.
        </p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Periode</th>
                <th style={thStyle}>Soort</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Bron</th>
              </tr>
            </thead>
            <tbody>
              {regels.map(r => (
                <tr key={r.key}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {periode(r.start_datum, r.eind_datum)}
                    {r.tijden && (
                      <span style={{ color: 'var(--fg-muted)', marginLeft: 6, fontSize: 11 }}>{r.tijden}</span>
                    )}
                  </td>
                  <td style={tdStyle}>{r.soort}</td>
                  <td style={tdStyle}><Badge tone={r.typeTone}>{r.typeLabel}</Badge></td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>
                    <Badge variant="outline" tone={r.bron === 'bouw7' ? 'info' : 'neutral'}>
                      {r.bron === 'bouw7' ? 'Bouw7' : 'EVA'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: '10px 0 0' }}>
        Bouw7-regels worden automatisch gesynchroniseerd. Handmatig verlof beheer je in Planning → Medewerkerplanning.
      </p>
    </div>
  )
}
