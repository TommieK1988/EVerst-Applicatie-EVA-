import { SECTIE_ROUTE } from '@/components/dossiers/open-dossier'
import { SERVICEDESK_OUDE_TABS } from '@/components/dossiers/servicedesk-tabs'
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
 * De nieuwe tab voor een opgeheven tab, of `null` als `tab` gewoon bestaat.
 *
 * De servicedesk-omleidingen staan apart omdat ze alléén daar gelden: op een opdracht is
 * `verkoop` nog gewoon een eigen tab, op een servicedeskbon is het een deel van Facturatie.
 * Ze worden afgeleid uit dezelfde tabel die de tabs tekent, zodat de twee niet uit elkaar
 * kunnen lopen.
 *
 * Puur en zonder `next/navigation`, zodat de middleware hem ook kan gebruiken.
 */
export function oudeTabBestemming(sectie: DossierSectie, id: string, tab: string): string | null {
  const nieuweTab = (sectie === 'servicedesk' ? SERVICEDESK_OUDE_TABS[tab] : undefined)
    ?? OUDE_TABS[tab]
  return nieuweTab ? `/${SECTIE_ROUTE[sectie]}/${id}/${nieuweTab}` : null
}

const SECTIE_VOOR_ROUTE = Object.fromEntries(
  (Object.entries(SECTIE_ROUTE) as [DossierSectie, string][]).map(([s, r]) => [r, s]),
) as Record<string, DossierSectie>

const DOSSIER_TAB_PAD = /^\/([a-z]+)\/([0-9a-fA-F-]{36})\/([a-z-]+)\/?$/

/**
 * Omleiding voor een volledig pad als `/servicedesk/<id>/informatie`, of `null`.
 *
 * Voor de middleware: daar is de omleiding een echte 307 vóór er iets rendert. In de page
 * zelf kan dat niet, want het dossier heeft een `loading.tsx` — zie `redirectOudeTab`.
 */
export function oudeTabOmleiding(pathname: string): string | null {
  const m = DOSSIER_TAB_PAD.exec(pathname)
  const sectie = m && SECTIE_VOOR_ROUTE[m[1]]
  return sectie ? oudeTabBestemming(sectie, m[2], m[3]) : null
}
