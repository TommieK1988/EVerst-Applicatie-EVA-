import { createAdminClient } from '@everts/database/server'
import type { PlanningUursoort } from '@everts/database/platform-types'
import UursoortBeheer from '@/components/planning/UursoortBeheer'
import UurtariefBeheer from '@/components/instellingen/UurtariefBeheer'
import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'

export const metadata = { title: 'Planning — Instellingen' }

export default async function PlanningInstellingenPage() {
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
      <PageHeader eyebrow="Instellingen" title="Planning" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Uursoorten, uurtarieven en standaardinstellingen voor de resourceplanning.
      </p>

      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: 'var(--fg)' }}>Uurtarieven</h2>
          <UurtariefBeheer initial={instellingen.uurtarieven ?? []} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: 'var(--fg)' }}>Uursoorten</h2>
          <UursoortBeheer initial={uursoorten} />
        </CardBody>
      </Card>
    </div>
  )
}
