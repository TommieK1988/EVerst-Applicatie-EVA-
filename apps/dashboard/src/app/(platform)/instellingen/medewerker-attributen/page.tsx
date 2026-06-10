import { createAdminClient } from '@everts/database/server'
import type { MedewerkerAttribuutDefinitie } from '@everts/database/platform-types'
import { PageHeader, Card, CardBody } from '@/components/ui'
import AttribuutDefinitiesBeheer from './AttribuutDefinitiesBeheer'

export const metadata = { title: 'Medewerker attributen — Instellingen' }

export default async function MedewerkerAttributenPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerker_attribuut_definities')
    .select('*')
    .order('volgorde', { ascending: true })

  const definities = (data ?? []) as MedewerkerAttribuutDefinitie[]

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Instellingen" title="Medewerker attributen" />
      <p className="-mt-3 mb-[22px] text-[13.5px] text-neutral-500">
        Definieer welke extra velden beschikbaar zijn op het medewerkersprofiel. Beheerders kunnen hier velden toevoegen, bewerken en deactiveren.
      </p>

      <Card>
        <CardBody>
          <AttribuutDefinitiesBeheer initial={definities} />
        </CardBody>
      </Card>
    </div>
  )
}
