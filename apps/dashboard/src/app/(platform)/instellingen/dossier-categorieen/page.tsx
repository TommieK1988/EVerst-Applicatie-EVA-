import { getDossierCategorieen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import DossierCategorieenBeheer from './DossierCategorieenBeheer'

export const metadata = { title: 'Dossier categorieën' }

export default async function Page() {
  const categorieen = await getDossierCategorieen()

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Dossiers" title="Dossier categorieën" />
      <p className="eva-page-desc">Beheer de beschikbare categorieën voor aanvragen, offertes en opdrachten.</p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <DossierCategorieenBeheer initial={categorieen} />
        </CardBody>
      </Card>
    </div>
  )
}
