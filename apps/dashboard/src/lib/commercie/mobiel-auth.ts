import 'server-only'
import { redirect } from 'next/navigation'
import { vereisRecht, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import type { ModuleRechten } from '@everts/database/platform-types'

/**
 * Autorisatie voor de mobiele module Commercieel (`/m/commercieel`).
 *
 * Gate is het bestaande recht `relaties`, niet een nieuw recht `commercieel`. Reden: het
 * scherm toont niets wat niet ook op de relatiepagina staat — het bundelt het alleen anders.
 * Een eigen recht zou standaard op niemand staan en dus eerst geseed moeten worden, terwijl
 * `relaties` vandaag precies de goede groep dekt: Directie en Projectbureau, de mensen die
 * opdrachtgevers spreken. Uitvoering heeft het niet en hoort het ook niet te hebben — dit
 * scherm laat omzet en openstaande facturen zien.
 *
 * Het blok met openstaande facturen zit daar bovenop nog achter `financieel` (zie
 * `getDebiteurenVoorRelatie`), dezelfde gate als het Debiteuren-scherm.
 *
 * Geen feature-flag zoals materieelbeheer: die module had een uitrolperiode waarin hij in
 * productie moest kunnen bestaan zonder zichtbaar te zijn. Hier doet het recht dat werk al.
 */

/**
 * Route-guard voor de mobiele pagina's. Onvoldoende recht → terug naar `/m`.
 *
 * Bewust `/m` en niet `/`: wie hier komt zit op een telefoon, en de desktopweergave is dan
 * geen bruikbare landingsplek.
 */
export async function vereisCommercieelToegang(
  min: ModuleRechten = 'lezen',
  terug = '/m',
): Promise<CurrentMedewerker> {
  try {
    const { medewerker } = await vereisRecht('relaties', min)
    return medewerker
  } catch (e) {
    // redirect() gooit zelf een Next-signaal; dat mag hier gewoon doorlopen.
    if (e instanceof GeenToegangError) redirect(terug)
    throw e
  }
}

/**
 * Gate voor muterende server-actions. Gooit in plaats van te redirecten: een action is ook
 * als kale RPC aan te roepen, en de admin-client erachter bypast RLS. Zonder deze check zou
 * elke ingelogde gebruiker eronder door kunnen.
 */
export async function vereisCommercieelMutatie(
  min: ModuleRechten = 'schrijven',
): Promise<CurrentMedewerker> {
  const { medewerker } = await vereisRecht('relaties', min)
  return medewerker
}
