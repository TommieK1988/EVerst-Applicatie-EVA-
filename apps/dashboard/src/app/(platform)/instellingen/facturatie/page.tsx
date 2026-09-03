import { getRegieOpslagPct } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { PageHeader, Card, CardBody } from '@/components/ui'
import RegieOpslagBeheer from './RegieOpslagBeheer'

export const metadata = { title: 'Facturatie' }

export default async function Page() {
  await vereisModuleToegang('financieel')
  const opslag = await getRegieOpslagPct()

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Financieel" title="Facturatie" />
      <p className="eva-page-desc">
        Instellingen voor het klaarzetten van facturen: hoe geboekte kosten worden doorbelast.
      </p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
            Opslag op geboekte kosten
          </h2>
          <RegieOpslagBeheer initial={opslag} />
        </CardBody>
      </Card>
    </div>
  )
}
