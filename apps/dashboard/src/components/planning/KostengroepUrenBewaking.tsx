import { getDossierUrenBewaking } from '@/lib/dossiers/actions'

type Rij = {
  code: string
  naam: string | null
  prognose_uren: number
  geplande_uren: number
  restant: number
}

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 10px',
  fontFamily: 'var(--font-ui)',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 10px',
  fontSize: 12,
  color: 'var(--fg)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Kleine samenvattingstabel bovenin de detailplanning: per Bouw7-bewakingscode
 * de geprognotiseerde arbeid-uren (live uit Bouw7) naast de in EVA geplande uren.
 * Rendert niets als er geen relevante codes zijn (bijv. geen Bouw7-koppeling).
 */
export default async function KostengroepUrenBewaking({
  dossier_id,
  geplandePerBewakingscode,
}: {
  dossier_id: string
  geplandePerBewakingscode: Record<string, number>
}) {
  const bewaking = await getDossierUrenBewaking(dossier_id)

  // Unie van codes met prognose-arbeid én codes waarop geplande uren staan,
  // zodat op een verkeerde code geboekte planning niet stilletjes verdwijnt.
  const prognosePerCode = new Map<string, { naam: string | null; uren: number }>()
  for (const r of bewaking.regels) {
    if (r.prognose_uren > 0) prognosePerCode.set(r.code, { naam: r.naam, uren: r.prognose_uren })
  }

  const codes = new Set<string>([...prognosePerCode.keys(), ...Object.keys(geplandePerBewakingscode)])
  if (codes.size === 0) return null

  const rijen: Rij[] = [...codes].map((code) => {
    const prog = prognosePerCode.get(code)
    const prognose_uren = prog?.uren ?? 0
    const geplande_uren = geplandePerBewakingscode[code] ?? 0
    return {
      code,
      naam: prog?.naam ?? null,
      prognose_uren,
      geplande_uren,
      restant: prognose_uren - geplande_uren,
    }
  }).sort((a, b) => a.code.localeCompare(b.code, 'nl', { numeric: true }))

  const totaal = rijen.reduce(
    (t, r) => ({
      prognose_uren: t.prognose_uren + r.prognose_uren,
      geplande_uren: t.geplande_uren + r.geplande_uren,
      restant: t.restant + r.restant,
    }),
    { prognose_uren: 0, geplande_uren: 0, restant: 0 },
  )

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...th, textAlign: 'left' }}>Bewakingscode</th>
            <th style={th}>Prognose arbeid</th>
            <th style={th}>Gepland</th>
            <th style={th}>Restant</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r) => {
            const over = r.geplande_uren > r.prognose_uren
            return (
              <tr key={r.code} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, textAlign: 'left', color: 'var(--fg)' }}>
                  <span style={{ fontWeight: 600 }}>{r.code}</span>
                  {r.naam ? <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>{r.naam}</span> : null}
                </td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{fmt(r.prognose_uren)}u</td>
                <td style={{ ...td, color: over ? '#e67e22' : 'var(--accent)', fontWeight: 600 }}>{fmt(r.geplande_uren)}u</td>
                <td style={{ ...td, color: r.restant < 0 ? '#e67e22' : 'var(--fg-muted)' }}>{fmt(r.restant)}u</td>
              </tr>
            )
          })}
        </tbody>
        {rijen.length > 1 && (
          <tfoot>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: 'var(--fg-muted)' }}>Totaal</td>
              <td style={{ ...td, fontWeight: 600, color: 'var(--fg-muted)' }}>{fmt(totaal.prognose_uren)}u</td>
              <td style={{ ...td, fontWeight: 600 }}>{fmt(totaal.geplande_uren)}u</td>
              <td style={{ ...td, fontWeight: 600, color: totaal.restant < 0 ? '#e67e22' : 'var(--fg-muted)' }}>{fmt(totaal.restant)}u</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}
