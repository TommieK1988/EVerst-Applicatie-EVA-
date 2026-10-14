import { redirect } from 'next/navigation'
import type { DossierSectie } from '@/components/dossiers/types'
import { oudeTabBestemming } from './oude-tab-pad'

/**
 * Stuurt door naar de nieuwe tab als `tab` een opgeheven tab is; doet anders niets.
 *
 * Alleen nog een vangnet. Het echte werk doet de middleware (`oudeTabOmleiding`): het
 * dossier heeft een `loading.tsx`, dus de respons streamt al vóór deze page draait en een
 * `redirect()` hier komt midden in de stream binnen. Bij een volledige paginalading klapt
 * de Next-router daarop met React-fout #310 — een seconde "Application error" en dan
 * alsnog de juiste pagina.
 */
export function redirectOudeTab(sectie: DossierSectie, id: string, tab: string): void {
  const bestemming = oudeTabBestemming(sectie, id, tab)
  if (bestemming) redirect(bestemming)
}
