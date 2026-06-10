import { getBetalingscondities, type Betalingsconditie } from './actions'
import BetalingsconditiesBeheer from './BetalingsconditiesBeheer'

export const metadata = { title: 'Betalingscondities' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  let condities: Betalingsconditie[] = []
  try {
    condities = await getBetalingscondities()
  } catch {
    // Tabel bestaat nog niet of migartie niet uitgevoerd
  }

  return (
    <div className="eva-page">
      <div className="eva-page-header">
        <p className="eva-page-kicker">Calculatie &amp; Offertes</p>
        <h1 className="eva-page-title">Betalingscondities</h1>
        <p className="eva-page-desc">
          Termijnschema&apos;s voor de aanneemsom — welk percentage wanneer verschuldigd is.
          Betalingstermijn (aantal dagen) stel je per relatie in.
        </p>
      </div>
      <div className="eva-card" style={{ padding: '24px 28px' }}>
        <BetalingsconditiesBeheer initial={condities} />
      </div>
    </div>
  )
}
