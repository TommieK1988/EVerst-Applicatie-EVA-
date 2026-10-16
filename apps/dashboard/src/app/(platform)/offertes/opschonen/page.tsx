import type { Metadata } from 'next'
import { getDossiersVoorOffertes } from '@/lib/dossiers/actions'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { OpschoonLijst } from '@/components/commercie/OpschoonLijst'

export const metadata: Metadata = { title: 'Offertes opschonen' }

/** De opschoonronde: oude open offertes in één keer laten vervallen (zie OpschoonLijst). */
export default async function OpschonenPage() {
  const [result, medewerker] = await Promise.all([getDossiersVoorOffertes(), getCurrentMedewerker()])
  return <OpschoonLijst dossiers={result.ok ? result.data : []} mijnMedewerkerId={medewerker?.id ?? null} />
}
