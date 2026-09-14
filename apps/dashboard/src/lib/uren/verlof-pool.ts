import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * Wie mag wiens verlof beoordelen.
 *
 * Verlof ging naar één aangewezen persoon (de teamleider, anders de terugvalgoedkeurder). Was die
 * er niet, dan lag de aanvraag stil. Voortaan beoordeelt een AFDELING: standaard Uitvoering ->
 * Projectbureau en al het overige -> Directie, in te stellen op Instellingen > Uren
 * (`uren_instellingen.verlof_routes`).
 *
 * Deze laag staat bewust apart van `verlof.ts` en `goedkeuring.ts`: die beginnen met 'use server'
 * en daar mag alleen een async server action uit geëxporteerd worden — een constante of een
 * synchrone helper breekt daar de build (en tsc ziet dat niet aankomen).
 *
 * `medewerkers.afdeling` is een vrij tekstveld zonder FK, dus overal genormaliseerd vergelijken.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Wie beoordeelt een afdeling waarvoor niets is ingesteld. */
export const STANDAARD_BEOORDELENDE_AFDELING = 'Directie'

export type VerlofRoutes = Record<string, string>

const norm = (a: string | null | undefined) => (a ?? '').trim().toLowerCase()

/** Genormaliseerd vergelijken van twee afdelingsnamen. */
export function zelfdeAfdeling(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) !== '' && norm(a) === norm(b)
}

/** De afdeling die het verlof van deze aanvrager beoordeelt. */
export function bepaalBeoordelendeAfdeling(
  afdelingAanvrager: string | null,
  routes: VerlofRoutes,
): string {
  const sleutel = Object.keys(routes ?? {}).find(k => zelfdeAfdeling(k, afdelingAanvrager))
  const gekozen = sleutel ? routes[sleutel] : null
  return gekozen?.trim() || STANDAARD_BEOORDELENDE_AFDELING
}

export type PoolLid = { id: string; naam: string; authUserId: string | null }

/**
 * De leden van een beoordelende afdeling die een melding kunnen ontvangen — actief én gekoppeld
 * aan een account. Zonder account kan iemand de aanvraag ook niet openen, dus dan telt hij niet
 * als beoordelaar. `.ilike` zonder % = exact maar hoofdletterongevoelig (zelfde truc als
 * `haalDirectie()` in lib/goedkeuring/beoordelaars.ts).
 */
export async function haalPoolLeden(afdeling: string): Promise<PoolLid[]> {
  if (!afdeling.trim()) return []
  const { data } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, auth_user_id')
    .eq('actief', true)
    .ilike('afdeling', afdeling.trim())
    .not('auth_user_id', 'is', null)
    .order('achternaam', { ascending: true })
    .limit(200)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(m => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    authUserId: m.auth_user_id ?? null,
  }))
}

export type VerlofRoute = {
  beoordelende_afdeling: string | null
  goedkeurder_id: string | null
}

/**
 * De enige autorisatiewaarheid voor goed- en afkeuren. Bewust géén uitsluiting van je eigen
 * aanvraag: Directie beoordeelt Directie, en daar mag iemand zijn eigen verlof afhandelen.
 *
 * `goedkeurder_id` blijft meetellen — dat is de uitzonderingsroute voor aanvragen die (nog) geen
 * beoordelende afdeling hebben.
 */
export function magVerlofBeoordelen(
  kijker: { id: string; afdeling: string | null },
  aanvraag: VerlofRoute,
): boolean {
  if (aanvraag.beoordelende_afdeling && zelfdeAfdeling(kijker.afdeling, aanvraag.beoordelende_afdeling)) {
    return true
  }
  return aanvraag.goedkeurder_id != null && aanvraag.goedkeurder_id === kijker.id
}
