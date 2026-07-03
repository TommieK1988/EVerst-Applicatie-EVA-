import { getDossierCategorieen, getGoedkeuringDrempelOfferte } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { PageHeader, Card, CardBody } from '@/components/ui'
import DossierCategorieenBeheer from './DossierCategorieenBeheer'
import GoedkeuringDrempelBeheer from './GoedkeuringDrempelBeheer'

export const metadata = { title: 'Dossier categorieën' }

export default async function Page() {
  const [categorieen, drempel] = await Promise.all([
    getDossierCategorieen(),
    getGoedkeuringDrempelOfferte(),
  ])

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Dossiers" title="Dossier categorieën" />
      <p className="eva-page-desc">Beheer de beschikbare categorieën voor aanvragen, offertes en opdrachten.</p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <DossierCategorieenBeheer initial={categorieen} />
        </CardBody>
      </Card>

      <Card style={{ maxWidth: 560, marginTop: 16 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Goedkeuring offertes</h2>
          <GoedkeuringDrempelBeheer initial={drempel} />
        </CardBody>
      </Card>
    </div>
  )
}
