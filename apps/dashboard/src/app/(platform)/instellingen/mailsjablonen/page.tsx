import { PageHeader, Card, CardBody } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getOverzicht, type MailSjablonenOverzicht } from './actions'
import MailSjablonenBeheer from './MailSjablonenBeheer'

export const metadata = { title: 'E-mailsjablonen' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Mailteksten gaan naar klanten en leveranciers; beheerderswerk. Redirect-guard hier, en de
  // muterende actions hebben hun eigen vereisBeheerder() — die zijn ook als kale RPC aanroepbaar.
  await vereisModuleToegang('instellingen', 'beheren')

  let overzicht: MailSjablonenOverzicht = { sjablonen: [], documentMails: [] }
  try {
    overzicht = await getOverzicht()
  } catch {
    // Tabel bestaat nog niet (migratie niet toegepast) — dan tonen we alleen de standaardteksten.
  }

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Bedrijf" title="E-mailsjablonen" />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        Het onderwerp en de tekst van elke e-mail die EVA verstuurt — van de offertemail tot de
        herinnering aan een onderaannemer. Pas je niets aan, dan gaat de standaardtekst de deur uit.
      </p>
      <Card>
        <CardBody>
          <MailSjablonenBeheer sjablonen={overzicht.sjablonen} documentMails={overzicht.documentMails} />
        </CardBody>
      </Card>
    </div>
  )
}
