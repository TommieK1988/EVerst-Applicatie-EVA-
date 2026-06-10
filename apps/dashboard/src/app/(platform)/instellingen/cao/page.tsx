import { createAdminClient } from '@everts/database/server'
import type { CaoDocument, CaoLoonschaal, Bedrijfsgegevens } from '@everts/database/platform-types'
import { PageHeader, Card, CardBody } from '@/components/ui'
import CaoBeheer from './CaoBeheer'

export const metadata = { title: 'CAO beheer — Instellingen' }

export default async function CaoPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data: docs }, { data: wms }] = await Promise.all([
    supabase
      .from('cao_documenten')
      .select('*, schalen:cao_loonschalen(*)')
      .eq('actief', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('bedrijfsgegevens')
      .select('id, naam')
      .in('type', ['organisatie', 'werkmaatschappij'])
      .order('naam'),
  ])

  const initial = (docs ?? []).map((d: CaoDocument & { schalen: CaoLoonschaal[] }) => ({
    ...d,
    schalen: (d.schalen ?? []).sort((a: CaoLoonschaal, b: CaoLoonschaal) => a.volgorde - b.volgorde),
  }))

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Instellingen" title="CAO beheer" />
      <p className="eva-page-desc -mt-3 mb-[22px]">
        Upload een CAO-document als PDF. EVA leest de loonschalen en treden automatisch in via AI.
        De schalen zijn daarna selecteerbaar bij het medewerkerprofiel.
      </p>
      <Card>
        <CardBody>
          <CaoBeheer
            initial={initial}
            werkmaatschappijen={(wms ?? []) as Pick<Bedrijfsgegevens, 'id' | 'naam'>[]}
          />
        </CardBody>
      </Card>
    </div>
  )
}
