import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { bedragklasse } from './bedragklassen'
import { offerteBedragen } from './dossier-bedragen'
import { magMegaEigenaarZijn } from './opvolging'

/**
 * Foutmelding als iemand eigenaar wordt van een mega-offerte zonder projectleider of directie
 * te zijn; null als het mag. De functie komt uit `medewerkers.functie`.
 */
export async function megaEigenaarFout(dossierId: string, eigenaarId: string): Promise<string | null> {
  const bedrag = (await offerteBedragen([dossierId])).get(dossierId) ?? null
  if (bedragklasse(bedrag) !== 'mega') return null
  const { data } = await createAdminClient()
    .from('medewerkers').select('functie').eq('id', eigenaarId).maybeSingle()
  return magMegaEigenaarZijn(data?.functie)
    ? null
    : 'Dit is een mega-offerte (vanaf € 125k): kies een projectleider of iemand van de directie als eigenaar.'
}
