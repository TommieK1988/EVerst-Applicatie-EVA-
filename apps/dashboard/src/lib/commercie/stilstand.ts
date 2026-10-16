import 'server-only'

/**
 * De stilstandvelden bij een vastgelegde uitkomst: waarom de offerte stilligt, wanneer de klant
 * beslist, en bij een mega-offerte de begrensde hercontrole. Los van `actions.ts` (dat tegen de
 * 800 regels zit); de regels zelf staan puur en getest in `opvolging.ts`.
 */

import { bedragklasse } from './bedragklassen'
import { leesBedragklassegrenzen } from './bedragklassen-server'
import { offerteBedragen } from './dossier-bedragen'
import { alsStilReden, begrensMegaHercontrole, standaardStilReden } from './opvolging'
import type { StapSoort, UitkomstSleutel } from './types'
import { vandaagNL } from '@/lib/wagenpark/periode'

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

export async function stilstandVelden(
  dossierId: string,
  uitkomst: UitkomstSleutel,
  stapSoort: StapSoort | null,
  stapDatum: string | null,
  invoer: { stilReden?: string | null; besluitDatum?: string | null },
): Promise<{ stap_datum?: string; stil_reden?: string | null; besluit_datum?: string | null }> {
  // Geen vervolg (verloren): niets staat meer stil.
  if (!stapSoort) return { stil_reden: null, besluit_datum: null }

  const uit: { stap_datum?: string; stil_reden?: string | null; besluit_datum?: string | null } = {}

  const reden = invoer.stilReden !== undefined ? alsStilReden(invoer.stilReden) : standaardStilReden(uitkomst)
  if (reden !== undefined) uit.stil_reden = reden

  // Bij een ALV is de gekozen datum de vergaderdatum: dat ís het besluitmoment.
  const opgegeven = invoer.besluitDatum && ISO_DATUM.test(invoer.besluitDatum) ? invoer.besluitDatum : null
  let besluit = opgegeven ?? (uitkomst === 'ligt_bij_alv' ? stapDatum : null)

  // Mega: wachten op de klant duurt nooit langer dan twee weken zonder hercontrole.
  if (stapSoort === 'wachten' && stapDatum) {
    const [bedragen, grenzen] = await Promise.all([offerteBedragen([dossierId]), leesBedragklassegrenzen()])
    if (bedragklasse(bedragen.get(dossierId) ?? null, grenzen) === 'mega') {
      const begrensd = begrensMegaHercontrole(stapDatum, vandaagNL())
      uit.stap_datum = begrensd.stapDatum
      besluit = besluit ?? begrensd.besluitDatum
    }
  }

  // Alleen overschrijven als er iets te zeggen valt; "geen gehoor" laat een eerder besluit staan.
  if (besluit) uit.besluit_datum = besluit
  else if (reden === null) uit.besluit_datum = null
  return uit
}
