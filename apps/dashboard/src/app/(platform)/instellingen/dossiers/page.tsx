import { getCategorieOpties } from '@/lib/dossiers/actions'
import { PageHeader, Card, CardBody, EmptyState } from '@/components/ui'
import { getToggleDefinities } from '../dossier-toggles/actions'
import DossierTogglesBeheer from '../dossier-toggles/DossierTogglesBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Dossiers' }

/**
 * Categorieën en tabbladen van een dossier op één scherm. Twee korte lijsten die allebei
 * bepalen hoe een dossier eruitziet; als losse schermen waren het twee tegels voor samen
 * een halve pagina inhoud.
 */
export default async function Page() {
  const [categorieen, definities] = await Promise.all([
    getCategorieOpties(),
    getToggleDefinities(),
  ])

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Dossiers" title="Dossiers" />
      <p className="eva-page-desc">
        Wat je op een aanvraag, offerte of opdracht kunt kiezen: de categorie en de schakelaars
        die bepalen welke tabbladen verschijnen.
      </p>

      <Card style={{ maxWidth: 560 }}>
        <CardBody>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Categorieën</h2>
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
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Tabbladen</h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
            Aan/uit-schakelaars die per dossier gezet kunnen worden (bijv. Spoed, Onder garantie).
            Ze bepalen welke tabbladen zichtbaar zijn en zijn bruikbaar als trigger of als conditie
            bij actielijst-sjablonen.
          </p>
          <DossierTogglesBeheer initial={definities} />
        </CardBody>
      </Card>
    </div>
  )
}
