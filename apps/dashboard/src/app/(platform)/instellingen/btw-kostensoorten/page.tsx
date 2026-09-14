import { createAdminClient } from '@everts/database/server'
import type { BtwTarief } from '@everts/database/platform-types'
import { BOUW7_COST_TYPE } from '@/lib/bouw7/client'
import { PageHeader, Card, CardBody, Badge } from '@/components/ui'
import BtwTarievenBeheer from '../btw-tarieven/BtwTarievenBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'BTW-tarieven & kostensoorten' }
export const dynamic = 'force-dynamic'

// Korte toelichting per Bouw7-kostensoort, zodat duidelijk is waarvoor elke soort gebruikt wordt.
const TOELICHTING: Record<number, string> = {
  1: 'Eigen en ingehuurde arbeid (uren × tarief).',
  2: 'Ingekochte materialen/diensten via inkooporders.',
  3: 'Vaste-prijs-opdrachten aan onderaannemers.',
  4: 'Huur en inzet van materieel/gereedschap.',
  5: 'Verwerkte materialen uit calculatie/artikelbestand.',
  6: 'Afval, stort en verwerking.',
}

/**
 * De twee financiële referentielijsten uit Bouw7 op één scherm. Allebei read-only en allebei
 * gebruikt door calculatie, offertes, facturen en inkoop — als losse schermen was het twee
 * tegels voor twee tabellen die je alleen opzoekt.
 */
export default async function Page() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('btw_tarieven')
    .select('*')
    .eq('actief', true)
    .order('percentage', { ascending: false })

  const tarieven = (data ?? []) as BtwTarief[]
  const kostensoorten = Object.entries(BOUW7_COST_TYPE) as [string, string][]

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Financieel" title="BTW-tarieven & kostensoorten" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Twee vaste lijsten uit Bouw7. Ze zijn de bron voor calculatie, offertes, verkoop, facturen
        en inkoop, en zijn hier alleen te lezen — wijzigen kan alleen in Bouw7.
      </p>

      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
              BTW-tarieven
            </h2>
            <Badge variant="outline" tone="neutral" size="sm">read-only</Badge>
          </div>
          <BtwTarievenBeheer tarieven={tarieven} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
              Kostensoorten
            </h2>
            <Badge variant="outline" tone="neutral" size="sm">read-only</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {kostensoorten.map(([id, naam]) => (
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
