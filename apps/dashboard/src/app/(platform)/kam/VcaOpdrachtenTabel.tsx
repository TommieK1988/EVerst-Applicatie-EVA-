import Link from 'next/link'
import { NAAR_NIEUW_TABBLAD } from '@/components/dossiers/open-dossier'
import type { VcaOpdrachtRij } from './actions'

type Props = { rijen: VcaOpdrachtRij[] }

const TH: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '10px 14px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg)',
}

const TD: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--fg)',
  padding: '12px 14px',
  verticalAlign: 'middle',
}

function Verhouding({ teller, noemer }: { teller: number; noemer: number }) {
  // Zonder VCA-acties valt er niets te tellen. Dat als '0 / 0' tonen leest als
  // 'alles klaar', terwijl er in werkelijkheid nog geen actielijst hangt.
  if (noemer === 0) {
    return <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>geen acties</span>
  }
  const compleet = teller >= noemer
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', color: compleet ? 'var(--success-600, #16a34a)' : 'var(--fg)' }}>
      <strong style={{ fontWeight: 700 }}>{teller}</strong>
      <span style={{ color: 'var(--fg-muted)' }}> / {noemer}</span>
    </span>
  )
}

export function VcaOpdrachtenTabel({ rijen }: Props) {
  if (rijen.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
        Geen opdrachten met VCA-toggle aan.
      </p>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      <style>{`.vca-opdr-rij:hover td { background: var(--bg); }`}</style>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>Projectnaam</th>
            <th style={TH}>Projectleider</th>
            <th style={TH}>Teamleider</th>
            <th style={TH}>Formulieren ingevuld</th>
            <th style={TH}>Acties afgevinkt</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r, i) => {
            const laatste = i === rijen.length - 1
            const cel: React.CSSProperties = {
              ...TD,
              borderBottom: laatste ? 'none' : '1px solid var(--border-soft)',
            }
            return (
              <tr key={r.dossier_id} className="vca-opdr-rij">
                <td style={cel}>
                  <Link
                    href={`/opdrachten/${r.dossier_id}/vca`}
                    {...NAAR_NIEUW_TABBLAD}
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    {r.dossiernummer && (
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.dossiernummer}</div>
                    )}
                    <div style={{ fontWeight: 600, color: 'var(--fg)', fontSize: 13, lineHeight: 1.3 }}>
                      {r.projectnaam}
                    </div>
                  </Link>
                </td>
                <td style={{ ...cel, color: r.projectleider ? 'var(--fg)' : 'var(--fg-muted)' }}>
                  {r.projectleider ?? '—'}
                </td>
                <td style={{ ...cel, color: r.teamleider ? 'var(--fg)' : 'var(--fg-muted)' }}>
                  {r.teamleider ?? '—'}
                </td>
                <td style={cel}>
                  <Verhouding teller={r.formulieren_ingevuld} noemer={r.acties_totaal} />
                </td>
                <td style={cel}>
                  <Verhouding teller={r.acties_gereed} noemer={r.acties_totaal} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
