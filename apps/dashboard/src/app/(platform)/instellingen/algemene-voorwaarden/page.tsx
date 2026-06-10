import { getAlgemeneVoorwaarden, type AlgemeneVoorwaarden } from './actions'
import AlgemeneVoorwaardenBeheer from './AlgemeneVoorwaardenBeheer'

export const metadata = { title: 'Algemene Voorwaarden' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  let items: AlgemeneVoorwaarden[] = []
  try {
    items = await getAlgemeneVoorwaarden()
  } catch {
    // Tabel bestaat nog niet
  }

  return (
    <div className="eva-page">
      <div className="eva-page-header">
        <p className="eva-page-kicker">Calculatie &amp; Offertes</p>
        <h1 className="eva-page-title">Algemene Voorwaarden</h1>
        <p className="eva-page-desc">Upload en beheer PDF-documenten met algemene voorwaarden voor offertes.</p>
      </div>
      <div className="eva-card" style={{ padding: '24px 28px' }}>
        <AlgemeneVoorwaardenBeheer initial={items} />
      </div>
    </div>
  )
}
