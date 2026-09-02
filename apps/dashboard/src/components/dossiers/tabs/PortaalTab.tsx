import { getPortaalDossierBeheer } from '@/lib/portaal/beheer'
import { PortaalTabClient } from './PortaalTabClient'

/**
 * De Portaal-tab van een dossier: wat ziet de opdrachtgever, en wie mag kijken.
 *
 * Bewust géén toggle-gate zoals VCA en Houtrot hebben. Die gates horen bij
 * werkprocessen die je per dossier aan- of uitzet; dit is er zelf één. De tab is
 * dus altijd zichtbaar (voor wie het recht heeft) en heeft bovenin één
 * schakelaar die het portaal voor dit dossier opent of sluit.
 */
export default async function PortaalTab({ dossierId }: { dossierId: string }) {
  const data = await getPortaalDossierBeheer(dossierId)
  return <PortaalTabClient dossierId={dossierId} data={data} />
}
