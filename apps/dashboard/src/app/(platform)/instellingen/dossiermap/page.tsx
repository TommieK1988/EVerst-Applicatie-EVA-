import { PageHeader, Card, CardBody } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'
import { getAanvraagCategorieen } from '@/lib/dossiers/actions'
import type { StandaardbestandRegel } from '@/lib/o365/dossiermap-standaardbestanden'
import { getStandaardbestanden, getWerkmaatschappijen } from './actions'
import DossiermapBeheer from './DossiermapBeheer'

export const metadata = { title: 'Dossiermap' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Beheerderswerk: wat hier staat landt in élke nieuwe dossiermap. Redirect-guard hier,
  // de muterende actions hebben hun eigen vereisBeheerder() als backstop.
  await vereisModuleToegang('instellingen', 'beheren')

  let regels: StandaardbestandRegel[] = []
  try {
    regels = await getStandaardbestanden()
  } catch {
    // Tabel bestaat nog niet (migratie niet toegepast) — leeg tonen i.p.v. crashen.
  }

  const [categorieen, werkmaatschappijen] = await Promise.all([
    getAanvraagCategorieen().catch(() => []),
    getWerkmaatschappijen().catch(() => []),
  ])

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Dossiers" title="Dossiermap" />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        Bij een nieuwe aanvraag maakt EVA in SharePoint een map aan met de naam
        <strong> dossiernummer - projectnaam</strong>. Wijzigt de projectnaam later, dan gaat de
        mapnaam mee. Hieronder bepaal je welke voorbeeldbestanden er meteen in komen te staan.
      </p>

      <Card>
        <CardBody>
          <h2 className="mb-1 font-[var(--font-ui)] text-[15px] font-bold">Voorbeeldbestanden</h2>
          <p className="mb-3 font-[var(--font-ui)] text-[12px] text-[var(--fg-muted)]">
            Deze bestanden komen alleen in mappen die EVA zelf aanmaakt — een bestaande map wordt
            nooit achteraf aangevuld. Staat er al een bestand met dezelfde naam, dan blijft dat
            staan. Laat je een submap leeg, dan komt het bestand direct in de dossiermap.
          </p>
          <DossiermapBeheer
            initial={regels}
            categorieen={categorieen}
            werkmaatschappijen={werkmaatschappijen}
          />
        </CardBody>
      </Card>
    </div>
  )
}
