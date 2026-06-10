import { getToggleDefinities } from './actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import DossierTogglesBeheer from './DossierTogglesBeheer'

export const metadata = { title: 'Dossier toggles' }

export default async function Page() {
  const definities = await getToggleDefinities()

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Dossiers" title="Dossier toggles" />
      <p className="eva-page-desc">
        Beheer aan/uit-schakelaars die per dossier gezet kunnen worden (bijv. Spoed, Onder garantie).
        Toggles zijn bruikbaar als trigger of als conditie bij actielijst-sjablonen.
      </p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <DossierTogglesBeheer initial={definities} />
        </CardBody>
      </Card>
    </div>
  )
}
