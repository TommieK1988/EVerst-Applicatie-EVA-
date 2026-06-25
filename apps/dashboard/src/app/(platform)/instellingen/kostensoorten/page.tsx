import { BOUW7_COST_TYPE } from '@/lib/bouw7/client'
import { PageHeader, Card, CardBody, Badge } from '@/components/ui'

export const metadata = { title: 'Kostensoorten' }

// Korte toelichting per Bouw7-kostensoort, zodat duidelijk is waarvoor elke soort gebruikt wordt.
const TOELICHTING: Record<number, string> = {
  1: 'Eigen en ingehuurde arbeid (uren × tarief).',
  2: 'Ingekochte materialen/diensten via inkooporders.',
  3: 'Vaste-prijs-opdrachten aan onderaannemers.',
  4: 'Huur en inzet van materieel/gereedschap.',
  5: 'Verwerkte materialen uit calculatie/artikelbestand.',
  6: 'Afval, stort en verwerking.',
}

export default function KostensoortenPage() {
  const rows = Object.entries(BOUW7_COST_TYPE) as [string, string][]

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Stamgegevens" title="Kostensoorten" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        De kostensoorten zijn een vaste indeling vanuit Bouw7 en worden gebruikt in de
        projectbewaking, inkoop en calculatie. Ze zijn read-only — wijzigen kan alleen in Bouw7.
      </p>

      <Card>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
              Bouw7-kostensoorten
            </h2>
            <Badge variant="outline" tone="neutral" size="sm">read-only</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map(([id, naam]) => (
              <div key={id} style={{
                display: 'grid', gridTemplateColumns: '48px 180px 1fr', alignItems: 'center', gap: 12,
                padding: '10px 4px', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {id}
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                  {naam}
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                  {TOELICHTING[Number(id)] ?? ''}
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
