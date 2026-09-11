import { getGoedkeuringDrempelOfferte } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { getCategorieOpties } from '@/lib/dossiers/actions'
import { PageHeader, Card, CardBody, EmptyState } from '@/components/ui'
import GoedkeuringDrempelBeheer from './GoedkeuringDrempelBeheer'

export const metadata = { title: 'Dossier categorieën' }

export default async function Page() {
  const [categorieen, drempel] = await Promise.all([
    getCategorieOpties(),
    getGoedkeuringDrempelOfferte(),
  ])

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Dossiers" title="Dossier categorieën" />
      <p className="eva-page-desc">De categorieën die je bij aanvragen, offertes en opdrachten kunt kiezen.</p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
            Een dossier heeft één categorie, en die staat in Bouw7. Hieronder zie je de lijst zoals Bouw7
            hem kent; wijzig je de categorie van een dossier in EVA, dan gaat dat meteen mee naar Bouw7.
            Nieuwe categorieën maak je in Bouw7 aan — ze verschijnen hier vanzelf.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categorieen.map(cat => (
              <span key={cat} style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)',
              }}>{cat}</span>
            ))}
            {categorieen.length === 0 && (
              <EmptyState
                size="sm"
                title="Geen categorieën gevonden"
                description="EVA kon de categorieënlijst niet bij Bouw7 ophalen."
              />
            )}
          </div>
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
