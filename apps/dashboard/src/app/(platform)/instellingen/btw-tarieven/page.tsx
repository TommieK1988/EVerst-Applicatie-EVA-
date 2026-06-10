import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import BtwTarievenBeheer from './BtwTarievenBeheer'

export const metadata = { title: 'BTW tarieven' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  const instellingen = await getBedrijfsinstellingen()
  return (
    <div className="eva-page">
      <PageHeader eyebrow="Calculatie & Offertes" title="BTW tarieven" />
      <p className="-mt-3 mb-[22px] text-sm text-neutral-500">
        Beschikbare BTW-percentages voor calculatieregels en offertes.
      </p>
      <Card>
        <CardBody>
          <BtwTarievenBeheer initial={instellingen.btw_tarieven ?? [0, 9, 21]} />
        </CardBody>
      </Card>
    </div>
  )
}
