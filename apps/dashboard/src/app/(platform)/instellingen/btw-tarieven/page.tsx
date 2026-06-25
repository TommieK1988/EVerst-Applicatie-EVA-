import { createAdminClient } from '@everts/database/server'
import type { BtwTarief } from '@everts/database/platform-types'
import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import BtwTarievenBeheer from './BtwTarievenBeheer'

export const metadata = { title: 'BTW-tarieven' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data }, instellingen] = await Promise.all([
    supabase
      .from('btw_tarieven')
      .select('*')
      .eq('actief', true)
      .order('percentage', { ascending: false }),
    getBedrijfsinstellingen(),
  ])

  const tarieven = (data ?? []) as BtwTarief[]
  // Legacy handmatige percentages die (nog) niet in de Bouw7-afgeleide lijst voorkomen.
  const afgeleidePercentages = new Set(tarieven.map(t => Number(t.percentage)))
  const legacyMismatch = (instellingen.btw_tarieven ?? []).filter(p => !afgeleidePercentages.has(Number(p)))

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Stamgegevens" title="BTW-tarieven" />
      <p className="-mt-3 mb-[22px] text-sm text-neutral-500">
        Read-only afgeleid uit Bouw7-offertes. Bron van waarheid voor calculatie, offertes, verkoop en facturen.
      </p>
      <Card>
        <CardBody>
          <BtwTarievenBeheer tarieven={tarieven} legacyMismatch={legacyMismatch} />
        </CardBody>
      </Card>
    </div>
  )
}
