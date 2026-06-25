import { createAdminClient } from '@everts/database/server'
import type { PlanningUursoort } from '@everts/database/platform-types'
import UursoortBeheer from '@/components/planning/UursoortBeheer'
import UurtariefBeheer from '@/components/instellingen/UurtariefBeheer'
import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'

export const metadata = { title: 'Uursoorten & uurtarieven' }
export const dynamic = 'force-dynamic'

export default async function UursoortenTarievenPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data }, instellingen] = await Promise.all([
    supabase
      .from('planning_uursoorten')
      .select('*')
      .eq('actief', true)
      .order('volgorde', { ascending: true }),
    getBedrijfsinstellingen(),
  ])

  const uursoorten = (data ?? []) as PlanningUursoort[]

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Stamgegevens" title="Uursoorten & uurtarieven" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Gedeelde gegevens voor planning, urenregistratie en calculatie. Uursoorten zijn leidend
        vanuit Bouw7 (read-only); uurtarieven volgen de hiërarchie medewerker → uursoort → globaal.
      </p>

      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: 'var(--fg)' }}>Uurtarieven</h2>
          <UurtariefBeheer initial={instellingen.uurtarieven ?? []} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <UursoortBeheer initial={uursoorten} />
        </CardBody>
      </Card>
    </div>
  )
}
