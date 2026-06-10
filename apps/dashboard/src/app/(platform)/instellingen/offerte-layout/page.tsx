import { getLayouts } from './actions'
import LayoutsBeheer from './LayoutsBeheer'
import { PageHeader, Card, CardBody } from '@/components/ui'

export const metadata = { title: 'Offerte layout' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  let layouts = []
  try {
    layouts = await getLayouts()
  } catch {
    // Tabel bestaat nog niet
  }

  return (
    <div className="eva-page">
      <PageHeader
        eyebrow="Calculatie & Offertes"
        title="Offerte layout"
      />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        Word-sjablonen met huisstijl, kleuren en papierindeling voor offertes.
      </p>
      <Card>
        <CardBody>
          <LayoutsBeheer initial={layouts} />
        </CardBody>
      </Card>
    </div>
  )
}
