import { vereisModuleToegang } from '@/lib/auth/rechten'
import { PageHeader } from '@/components/ui'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'
import { getGoedkeurInstellingen } from '@/lib/inkoopfacturen/goedkeur-instellingen'
import GoedkeurrouteBeheer from './GoedkeurrouteBeheer'

export const metadata = { title: 'Goedkeurroute inkoopfacturen' }
export const dynamic = 'force-dynamic'

/**
 * Wie welke inkoopfactuur goedkeurt. Gevoelig, dus alleen voor beheerders (`instellingen:
 * beheren`, in de praktijk Directie) — niet voor iedereen met beheerrecht op inkoop.
 */
export default async function Page() {
  await vereisModuleToegang('instellingen', 'beheren')
  const data = await getGoedkeurInstellingen()

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Financieel" title="Goedkeurroute inkoopfacturen" />
      <p className="eva-page-desc">
        Een projectfactuur gaat naar een dossierrol die je kiest (standaard de projectleider). Overhead gaat naar de goedkeurder
        van de 4000-grootboekrekening, en anders naar de vaste goedkeurder. Boven de drempel (excl. btw)
        volgt een tweede akkoord.
      </p>
      <GoedkeurrouteBeheer data={data} />
    </div>
  )
}
