import { PageHeader, Card, CardBody } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'
import type { BestandSoortDef } from '@/lib/dossiers/bestand-soort'
import { getBestandSoorten } from './actions'
import BestandssoortenBeheer from './BestandssoortenBeheer'

export const metadata = { title: 'Bestandssoorten' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Redirect-guard hier; de muterende actions hebben hun eigen vereisBeheerder().
  await vereisModuleToegang('instellingen', 'beheren')

  let soorten: BestandSoortDef[] = []
  try {
    soorten = await getBestandSoorten()
  } catch {
    // Tabel bestaat nog niet (migratie niet toegepast) — leeg tonen i.p.v. crashen.
  }

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Dossiers" title="Bestandssoorten" />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        De soorten die je in de Bestanden-tab van een dossier aan een bestand kunt geven, zoals
        offerte, tekening of factuur. Met trefwoorden en extensies herkent EVA de soort zelf.
      </p>

      <Card>
        <CardBody>
          <p className="mb-4 font-[var(--font-ui)] text-[12px] text-[var(--fg-muted)]">
            EVA kijkt naar de bestandsnaam, de omschrijving en de Bouw7-categorie. De eerste soort
            van boven die past wint, dus zet de meest specifieke bovenaan. Een soort die iemand in
            het dossier zelf kiest, gaat altijd voor.
          </p>
          <BestandssoortenBeheer initial={soorten} />
        </CardBody>
      </Card>
    </div>
  )
}
