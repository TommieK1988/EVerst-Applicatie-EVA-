import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, vereisSessie, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'
import type { PrikklokInstellingen } from './types'

/**
 * Wie de prikklok ziet — twee lagen:
 *
 *  1. De env-flag `NEXT_PUBLIC_FEATURE_PRIKKLOK`: de noodrem. Uit = de module bestaat niet.
 *  2. De fase in `prikklok_instellingen`:
 *     - 'schaduw' → alleen wie in `tester_ids` staat. Bewust GEEN recht: `heeftModuleToegang`
 *       laat elke beheerder altijd door, en dan zou de tegel bij iedereen met
 *       `instellingen = beheren` opduiken terwijl hij nog in de test zit.
 *     - 'live'    → wordt bij de omschakeling een gewoon recht (Uitvoering). Tot die tijd
 *       blijft ook 'live' tot de testers beperkt, zodat een per ongeluk omgezette vlag niemand
 *       onverwacht een half af scherm geeft.
 */

const STANDAARD: PrikklokInstellingen = {
  fase: 'schaduw',
  tester_ids: [],
  straal_m: 250,
  max_nauwkeurigheid_m: 100,
  afronding_min: 15,
  pauze_min: 30,
  pauze_vanaf_min: 330,
  herinnering_na_min: 30,
}

export async function getPrikklokInstellingen(): Promise<PrikklokInstellingen> {
  const { data } = await createAdminClient()
    .from('prikklok_instellingen')
    .select('fase, tester_ids, straal_m, max_nauwkeurigheid_m, afronding_min, pauze_min, pauze_vanaf_min, herinnering_na_min')
    .eq('id', true)
    .maybeSingle()
  if (!data) return STANDAARD
  return { ...STANDAARD, ...data, fase: data.fase === 'live' ? 'live' : 'schaduw', tester_ids: data.tester_ids ?? [] }
}

/** Mag deze medewerker de prikklok zien? Fail-closed: bij twijfel nee. */
export async function magPrikklok(medewerkerId: string | null | undefined): Promise<boolean> {
  if (!FEATURES.prikklok || !medewerkerId) return false
  try {
    const inst = await getPrikklokInstellingen()
    return inst.tester_ids.includes(medewerkerId)
  } catch {
    return false
  }
}

/** Route-guard voor de schermen: geen toegang → terug naar het mobiele startscherm. */
export async function vereisPrikklok(terug = '/m'): Promise<{
  medewerker: CurrentMedewerker
  instellingen: PrikklokInstellingen
}> {
  if (!FEATURES.prikklok) notFound()
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) redirect(terug)
  const instellingen = await getPrikklokInstellingen()
  if (!instellingen.tester_ids.includes(medewerker.id)) redirect(terug)
  return { medewerker, instellingen }
}

/**
 * Gate voor server-actions. Gooit in plaats van te redirecten: actions zijn ook als kale RPC aan
 * te roepen, en draaien op de admin-client — zonder deze check kan elke ingelogde gebruiker ze
 * aanroepen.
 */
export async function vereisPrikklokActie(): Promise<{
  medewerker: CurrentMedewerker
  instellingen: PrikklokInstellingen
}> {
  if (!FEATURES.prikklok) throw new GeenToegangError('De prikklok is niet actief')
  const medewerker = await vereisSessie()
  const instellingen = await getPrikklokInstellingen()
  if (!instellingen.tester_ids.includes(medewerker.id)) {
    throw new GeenToegangError('Je hebt geen toegang tot de prikklok')
  }
  return { medewerker, instellingen }
}
