import React from 'react'
import Link from 'next/link'
import { createAdminClient } from '@everts/database/server'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

/**
 * De formulier-inzendingen van dit dossier. Stond eerder als sectie "VCA-formulieren"
 * onderin de VCA-tab, terwijl de query nooit op VCA filterde — het waren altijd alle
 * inzendingen. Nu is het een eigen deel van KAM/VGM, en daarmee de vervanger van de
 * losse Formulieren-tab die op de desktop nooit een implementatie heeft gehad.
 */
type FormulierInzending = {
  id: string
  template_id: string
  status: string
  aangemaakt_op: string
  ingediend_op: string | null
  project_ref: string | null
  template: { naam: string } | null
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  concept:     { bg: '#f3f4f6', color: '#6b7280' },
  ingediend:   { bg: '#dbeafe', color: '#1d4ed8' },
  goedgekeurd: { bg: '#dcfce7', color: '#16a34a' },
  afgekeurd:   { bg: '#fee2e2', color: '#dc2626' },
}

function formatDatum(iso: string) {
  try { return format(new Date(iso), 'd MMM yyyy', { locale: nl }) } catch { return '—' }
}

export default async function FormulierenDeel({ dossierId }: { dossierId: string }) {
  const supabase = createAdminClient()

  // Begrensd op dossier_id: een dossier haalt de 1000-rijengrens van PostgREST niet.
  const { data } = await supabase
    .from('form_inzendingen')
    .select('id, template_id, status, aangemaakt_op, ingediend_op, project_ref, template:template_id(naam)')
    .eq('dossier_id', dossierId)
    .order('aangemaakt_op', { ascending: false })
    .limit(200)

  const inzendingen = (data ?? []) as unknown as FormulierInzending[]

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 860 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Formulieren</h2>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Alle formulieren die op dit dossier zijn ingevuld. Invullen loopt via een actie of via
        de mobiele app.
      </p>

      {inzendingen.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Nog geen formulieren ingevuld voor dit dossier.
        </p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Status', 'Formulier', 'Datum', 'Ingediend'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
                <th style={{ padding: '9px 14px', width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {inzendingen.map((inz, i) => {
                const s = STATUS_BADGE[inz.status] ?? STATUS_BADGE.concept
                return (
                  <tr key={inz.id} style={{ borderBottom: i < inzendingen.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
                        {inz.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{inz.template?.naam ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{formatDatum(inz.aangemaakt_op)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{inz.ingediend_op ? formatDatum(inz.ingediend_op) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/formulieren/${inz.template_id}/inzendingen/${inz.id}`}
                        style={{ color: '#009439', fontSize: 12, textDecoration: 'none' }}>
                        →
                      </Link>
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
