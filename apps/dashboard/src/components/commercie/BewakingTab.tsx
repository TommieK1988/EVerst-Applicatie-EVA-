/**
 * Dossier-tab "Bewaking": de commerciële opvolging van één offerte.
 *
 * Toont dezelfde offertekaart als het zijpaneel in Te doen (BewakingTabKaart), met daarnaast de
 * Bouw7-offertes onder dit project.
 */

import { getOffertesVoorDossier } from '@/lib/commercie/bouw7-offertes'
import { getMedewerkers } from '@/lib/dossiers/actions'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import type { DossierRij } from '@/components/dossiers/types'
import { BewakingTabKaart } from './BewakingTabKaart'
import { OffertesBlok } from './OffertesBlok'

export default async function BewakingTab({
  id, dossier,
}: { id: string; dossier: DossierRij | null }) {
  const [medewerkers, offertes, ik] = await Promise.all([
    getMedewerkers(),
    getOffertesVoorDossier(id),
    getCurrentMedewerker(),
  ])

  if (!dossier) return <p className="text-sm text-neutral-500">Dossier niet gevonden.</p>

  return (
    <div className="grid grid-cols-1 items-start gap-4 pb-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <BewakingTabKaart dossier={dossier} medewerkers={medewerkers} mijnMedewerkerId={ik?.id ?? null} />
      <OffertesBlok offertes={offertes} />
    </div>
  )
}
