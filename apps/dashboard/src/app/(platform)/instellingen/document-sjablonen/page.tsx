import { getSjablonen } from './actions'
import SjablonenBeheer from './SjablonenBeheer'
import { PageHeader, Card, CardBody } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import type { DocumentSjabloon } from '@/lib/documenten/types'

export const metadata = { title: 'Documentsjablonen' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Sjabloonbeheer is beheerderswerk: een kapot template raakt iedereen die er een
  // brief mee opstelt. Redirect-guard hier; de muterende actions hebben hun eigen
  // vereisBeheerder() als backstop (page-guard alleen is niet genoeg — actions zijn
  // ook als kale RPC aanroepbaar).
  await vereisModuleToegang('instellingen', 'beheren')

  let sjablonen: DocumentSjabloon[] = []
  try {
    sjablonen = await getSjablonen()
  } catch {
    // Tabel bestaat nog niet (migratie niet toegepast) — leeg tonen i.p.v. crashen.
  }

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Documenten" title="Documentsjablonen" />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        Word-sjablonen voor bewonersbrieven, garantiecertificaten en informatiebrieven.
        Opmaak maak je in Word; hier koppel je het bestand en bepaal je welke gegevens erin komen.
      </p>
      <Card>
        <CardBody>
          <SjablonenBeheer initial={sjablonen} />
        </CardBody>
      </Card>
    </div>
  )
}
