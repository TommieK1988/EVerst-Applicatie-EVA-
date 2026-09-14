import { getRegieOpslagPct } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getRedencodes, type Redencode } from '@/lib/debiteuren/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import RegieOpslagBeheer from './RegieOpslagBeheer'
import RedencodesBeheer from '../debiteur-redencodes/RedencodesBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Facturatie' }
export const dynamic = 'force-dynamic'

/**
 * De twee financiële instellingen die het Facturen-scherm sturen: hoe geboekte kosten worden
 * doorbelast, en waarom een factuur openstaat.
 *
 * Let op: dit scherm vraagt `financieel: beheren`. De regie-opslag stond eerder op `lezen`,
 * maar beide blokken zijn beheerwerk en één gate is eerlijker dan twee.
 */
export default async function Page() {
  await vereisModuleToegang('financieel', 'beheren')

  const opslag = await getRegieOpslagPct()

  let redencodes: Redencode[] = []
  try {
    redencodes = await getRedencodes({ inclusiefInactief: true })
  } catch {
    // tabel bestaat nog niet
  }

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Financieel" title="Facturatie" />
      <p className="eva-page-desc">
        Instellingen voor het klaarzetten en opvolgen van facturen.
      </p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
            Opslag op geboekte kosten
          </h2>
          <RegieOpslagBeheer initial={opslag} />
        </CardBody>
      </Card>

      <Card style={{ maxWidth: 560, marginTop: 16 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
            Debiteuren — redencodes
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
            De redenen &quot;niet betaald&quot; die de projectleider op het Facturen-scherm kan kiezen.
            Bestaande codes blijven bewaard (soft-delete) zodat historie intact blijft.
          </p>
          <RedencodesBeheer initial={redencodes} />
        </CardBody>
      </Card>
    </div>
  )
}
