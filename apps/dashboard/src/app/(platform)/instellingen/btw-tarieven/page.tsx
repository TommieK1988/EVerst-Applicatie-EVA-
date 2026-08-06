import { createAdminClient } from '@everts/database/server'
import type { BtwTarief } from '@everts/database/platform-types'
import { PageHeader, Card, CardBody } from '@/components/ui'
import BtwTarievenBeheer from './BtwTarievenBeheer'

export const metadata = { title: 'BTW-tarieven' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('btw_tarieven')
    .select('*')
    .eq('actief', true)
    .order('percentage', { ascending: false })

  const tarieven = (data ?? []) as BtwTarief[]

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Stamgegevens" title="BTW-tarieven" />
      <p className="-mt-3 mb-[22px] text-sm text-neutral-500">
        Read-only afgeleid uit Bouw7-offertes. Deze lijst is de bron voor calculatie, offertes,
        verkoop en facturen — precies deze tarieven staan ook in de keuzelijst van het rekenblad.
      </p>
      <Card>
        <CardBody>
          <BtwTarievenBeheer tarieven={tarieven} />
        </CardBody>
      </Card>
    </div>
  )
}
