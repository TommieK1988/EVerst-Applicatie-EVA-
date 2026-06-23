import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getRedencodes, type Redencode } from '@/lib/debiteuren/actions'
import RedencodesBeheer from './RedencodesBeheer'

export const metadata = { title: 'Debiteuren — redencodes' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  await vereisModuleToegang('financieel', 'beheren')

  let redencodes: Redencode[] = []
  try {
    redencodes = await getRedencodes({ inclusiefInactief: true })
  } catch {
    // tabel bestaat nog niet
  }

  return (
    <div className="eva-page">
      <div className="eva-page-header">
        <p className="eva-page-kicker">Financieel</p>
        <h1 className="eva-page-title">Debiteuren — redencodes</h1>
        <p className="eva-page-desc">
          De redenen &quot;niet betaald&quot; die de projectleider op het Facturen-scherm kan kiezen.
          Bestaande codes blijven bewaard (soft-delete) zodat historie intact blijft.
        </p>
      </div>
      <div className="eva-card" style={{ padding: '24px 28px' }}>
        <RedencodesBeheer initial={redencodes} />
      </div>
    </div>
  )
}
