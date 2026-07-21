import { getDossierUrenBewaking } from '@/lib/dossiers/actions'

type Rij = {
  code: string
  naam: string | null
  prognose_uren: number
  geplande_uren: number
  geboekte_uren: number
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
 * Kleine samenvattingstabel bovenin de detailplanning: per bewakingscode de
 * geprognotiseerde arbeid-uren (uit EVA) naast de in EVA geplande uren en de
 * werkelijk geboekte uren. Rendert niets als er geen relevante codes zijn.
 *
 * De geplande uren komen via de prop binnen — die zijn in `DossierPlanningTab`
 * per planitem herberekend uit het werkrooster (niet uit het Bouw7-uren-veld).
 */
export default async function KostengroepUrenBewaking({
  dossier_id,
  geplandePerBewakingscode,
}: {
  dossier_id: string
  geplandePerBewakingscode: Record<string, number>
}) {
  const bewaking = await getDossierUrenBewaking(dossier_id)

  const refPerCode = new Map<string, { naam: string | null; prognose_uren: number; geboekte_uren: number }>()
  for (const r of bewaking.regels) {
    refPerCode.set(r.code, { naam: r.naam, prognose_uren: r.prognose_uren, geboekte_uren: r.geboekte_uren })
  }

  const codes = new Set<string>([...refPerCode.keys(), ...Object.keys(geplandePerBewakingscode)])
  if (codes.size === 0) return null

  const rijen: Rij[] = [...codes].map((code) => {
    const ref = refPerCode.get(code)
    return {
      code,
      naam: ref?.naam ?? null,
      prognose_uren: ref?.prognose_uren ?? 0,
      geplande_uren: geplandePerBewakingscode[code] ?? 0,
      geboekte_uren: ref?.geboekte_uren ?? 0,
    }
  }).sort((a, b) => a.code.localeCompare(b.code, 'nl', { numeric: true }))

  const totaal = rijen.reduce(
    (t, r) => ({
      prognose_uren: t.prognose_uren + r.prognose_uren,
      geplande_uren: t.geplande_uren + r.geplande_uren,
      geboekte_uren: t.geboekte_uren + r.geboekte_uren,
    }),
    { prognose_uren: 0, geplande_uren: 0, geboekte_uren: 0 },
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
            <th style={th}>Prognose</th>
            <th style={th}>Gepland</th>
            <th style={th}>Geboekt</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r) => {
            // Gepland boven de prognose = oranje signaal (alleen als er een prognose is).
            const overPrognose = r.prognose_uren > 0 && r.geplande_uren > r.prognose_uren
            return (
              <tr key={r.code} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, textAlign: 'left', color: 'var(--fg)' }}>
                  <span style={{ fontWeight: 600 }}>{r.code}</span>
                  {r.naam ? <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>{r.naam}</span> : null}
                </td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{fmt(r.prognose_uren)}u</td>
                <td style={{ ...td, color: overPrognose ? '#e67e22' : 'var(--accent)', fontWeight: 600 }}>{fmt(r.geplande_uren)}u</td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{fmt(r.geboekte_uren)}u</td>
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
              <td style={{ ...td, fontWeight: 600, color: 'var(--fg-muted)' }}>{fmt(totaal.geboekte_uren)}u</td>
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
