/**
 * Dossier-tab "Bewaking" — de commerciële opvolging van één offerte.
 *
 * Server-component: haalt de kaart, de tijdlijn en de collega-lijst op en geeft ze door aan het
 * client-paneel. Het bedrag komt bewust uit `berekenKaartBedrag`, dezelfde helper die het bord
 * en het Informatie-tab gebruiken — anders zou hier een ander getal staan dan op de kaart.
 */

import { getBewaking, getTijdlijn, getOffertesVoorDossier } from '@/lib/commercie/actions'
import { getMedewerkers } from '@/lib/dossiers/actions'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { DossierRij } from '@/components/dossiers/types'
import { BewakingPaneel } from './BewakingPaneel'
import { Tijdlijn } from './Tijdlijn'
import { OffertesBlok } from './OffertesBlok'

export default async function BewakingTab({
  id, dossier,
}: { id: string; dossier: DossierRij | null }) {
  const [weergave, tijdlijn, medewerkers, offertes] = await Promise.all([
    getBewaking(id),
    getTijdlijn(id),
    getMedewerkers(),
    getOffertesVoorDossier(id),
  ])

  const bedrag = dossier ? berekenKaartBedrag(dossier, 'offerte').totaalExclBtw : null

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BewakingPaneel
        dossierId={id}
        kaart={weergave.kaart}
        status={weergave.status}
        eigenaarNaam={weergave.eigenaarNaam}
        actiehouderNaam={weergave.actiehouderNaam}
        afgerond={weergave.afgerond}
        medewerkers={medewerkers}
        bedrag={bedrag}
        klant={dossier?.klant_naam ?? null}
      />
      <OffertesBlok offertes={offertes} />
      <Tijdlijn regels={tijdlijn} />
    </div>
  )
}
