import { redirect } from 'next/navigation'
import { SECTIE_ROUTE } from '@/components/dossiers/open-dossier'
import type { DossierSectie } from '@/components/dossiers/types'

/**
 * Tabs die zijn opgegaan in een andere tab, met hun nieuwe bestemming.
 *
 * Bladwijzers, in mails gedeelde links en oudere `revalidatePath`-aanroepen wijzen er nog
 * naar. Zonder omleiding landen die op de generieke "niet beschikbaar"-weergave.
 */
const OUDE_TABS: Record<string, string> = {
  vca:         'kam',
  oplevering:  'kam?deel=oplevering',
  formulieren: 'kam?deel=formulieren',
  portaal:     'informatie',   // Klantportaal is nu een blok op de Informatie-tab.
}

/**
 * Stuurt door naar de nieuwe tab als `tab` een opgeheven tab is; doet anders niets.
 *
 * Bewust in de page en niet in `DossierTabContent`: het dossier heeft een `loading.tsx`,
 * dus tegen de tijd dat de content rendert is er al gestreamd en wordt het een
 * client-side redirect — met een zichtbare foutflits ertussen. Vanuit de page gaat het
 * om een gewone 307 vóór het eerste byte.
 */
export function redirectOudeTab(sectie: DossierSectie, id: string, tab: string): void {
  const nieuweTab = OUDE_TABS[tab]
  if (nieuweTab) redirect(`/${SECTIE_ROUTE[sectie]}/${id}/${nieuweTab}`)
}
