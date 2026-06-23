import Link from 'next/link'
import type { VcaOpdrachtRij } from './actions'

type Props = { rijen: VcaOpdrachtRij[] }

const HEADER_CEL: React.CSSProperties = {
  padding: '9px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
}

function Verhouding({ teller, noemer }: { teller: number; noemer: number }) {
  const compleet = noemer > 0 && teller >= noemer
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', color: compleet ? '#16a34a' : 'var(--text)' }}>
      <strong style={{ fontWeight: 700 }}>{teller}</strong>
      <span style={{ color: 'var(--text-muted)' }}> / {noemer}</span>
    </span>
  )
}

export function VcaOpdrachtenTabel({ rijen }: Props) {
  if (rijen.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Geen opdrachten met VCA-toggle aan.
      </p>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <th style={HEADER_CEL}>Projectnaam</th>
            <th style={HEADER_CEL}>Projectleider</th>
            <th style={HEADER_CEL}>Teamleider</th>
            <th style={HEADER_CEL}>VCA-formulieren (ingevuld / totaal)</th>
            <th style={HEADER_CEL}>Follow-up taken (voltooid / totaal)</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r, i) => (
            <tr key={r.dossier_id} style={{ borderBottom: i < rijen.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                <Link
                  href={`/opdrachten/${r.dossier_id}/vca`}
                  style={{ color: '#009439', textDecoration: 'none' }}
                >
                  {r.projectnaam}
                </Link>
                {r.dossiernummer && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.dossiernummer}
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 14px', color: r.projectleider ? 'var(--text)' : 'var(--text-muted)' }}>
                {r.projectleider ?? '—'}
              </td>
              <td style={{ padding: '10px 14px', color: r.teamleider ? 'var(--text)' : 'var(--text-muted)' }}>
                {r.teamleider ?? '—'}
              </td>
              <td style={{ padding: '10px 14px' }}>
                <Verhouding teller={r.formulieren_ingevuld} noemer={r.formulieren_totaal} />
              </td>
              <td style={{ padding: '10px 14px' }}>
                <Verhouding teller={r.taken_voltooid} noemer={r.taken_totaal} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
