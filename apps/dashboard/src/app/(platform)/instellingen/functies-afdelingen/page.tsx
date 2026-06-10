import { createAdminClient } from '@everts/database/server'
import type { MedewerkerFunctie, MedewerkerAfdeling } from '@everts/database/platform-types'
import { PageHeader, Card, CardBody } from '@/components/ui'
import FunctiesAfdelingenBeheer from './FunctiesAfdelingenBeheer'

export const metadata = { title: 'Functies & Afdelingen — Instellingen' }

export default async function FunctiesAfdelingenPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data: functies }, { data: afdelingen }] = await Promise.all([
    supabase.from('medewerker_functies').select('*').order('volgorde').order('naam'),
    supabase.from('medewerker_afdelingen').select('*').order('volgorde').order('naam'),
  ])

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Instellingen" title="Functies & Afdelingen" />
      <p className="-mt-3 mb-[22px] text-[13.5px] text-neutral-500">
        Beheer de beschikbare functies en afdelingen. Deze worden als keuzelijst aangeboden bij medewerkerprofielen.
      </p>
      <Card>
        <CardBody>
          <FunctiesAfdelingenBeheer
            functies={(functies ?? []) as MedewerkerFunctie[]}
            afdelingen={(afdelingen ?? []) as MedewerkerAfdeling[]}
          />
        </CardBody>
      </Card>
    </div>
  )
}
