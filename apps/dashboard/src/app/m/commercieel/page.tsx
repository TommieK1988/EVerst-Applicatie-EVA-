import { vereisCommercieelToegang } from '@/lib/commercie/mobiel-auth'
import AppHeader from '@/components/mobiel/AppHeader'
import KlantZoek from '@/components/mobiel/commercieel/KlantZoek'

export const metadata = { title: 'Commercieel · EVA Mobiel' }

/**
 * Zoekscherm van de module Commercieel.
 *
 * `force-dynamic` omdat de gate per gebruiker verschilt: een statisch gecachete versie zou
 * het scherm serveren aan iemand die er geen recht op heeft.
 */
export const dynamic = 'force-dynamic'

export default async function CommercieelZoekPage() {
  // Redirect naar /m zonder het recht `relaties`; de tegel op het startscherm is dan ook al weg.
  await vereisCommercieelToegang('lezen', '/m')

  return (
    <>
      <AppHeader title="Commercieel" sub="Klantbeeld" backHref="/m" />
      <KlantZoek />
    </>
  )
}
