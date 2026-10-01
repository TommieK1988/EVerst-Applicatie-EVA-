'use server'

/**
 * Het contracttotaal van een servicedeskbon voor de kaart op het bord — hetzelfde getal als de
 * Verkoop-tab van die bon. Zelfde drie bronnen, zelfde rekenregel (`berekenContracttotaalVerkoop`);
 * zou de kaart een eigen benadering gebruiken, dan staat er vroeg of laat een ander bedrag op de
 * kaart dan op de tab.
 *
 * Duur: per regiebon zo'n twintig Postgres-lezingen (snapshots, factuurinstellingen), geen
 * Bouw7-aanroepen. Voor een heel bord is dat een paar seconden, daarom haalt het bord dit na de
 * eerste render op in plaats van de pagina erop te laten wachten.
 */

import { vereisRecht } from '@/lib/auth/rechten'
import { berekenContracttotalen, type ContracttotaalKaart } from './contracttotaal-bereken'

/** Hoeveel bonnen tegelijk: genoeg om snel te zijn zonder de database te overvragen. */
const GELIJKTIJDIG = 8
/** Bovengrens per aanroep; het bord toont er rond de 150. */
const MAX_BONNEN = 600

/**
 * Contracttotalen voor een lijst bonnen. Een bon die faalt krijgt `null` en laat de rest staan:
 * één kapotte snapshot mag niet het hele bord zonder bedragen laten.
 */
export async function laadContracttotalen(
  dossierIds: string[],
): Promise<Record<string, ContracttotaalKaart | null>> {
  await vereisRecht('servicedesk', 'lezen')

  const ids = [...new Set(dossierIds)].slice(0, MAX_BONNEN)
  return berekenContracttotalen(ids, GELIJKTIJDIG)
}
