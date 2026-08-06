import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { DIRECTIE_AFDELING, type BeoordelaarRef, type BeoordelingsRoute } from './types'

/**
 * Wie beoordeelt een goedkeuringsaanvraag? De controller van het dossier. Heeft het
 * dossier er geen — verreweg de meeste dossiers — dan kiest de aanvrager zelf een
 * directielid; die mogen volgens `autorisatie.ts` sowieso altijd accorderen.
 *
 * Bewust géén stille terugval meer op één vaste medewerker: dan lag er wel een taak,
 * maar wist niemand dat hij er lag.
 */

const VELDEN = 'id, voornaam, tussenvoegsel, achternaam, auth_user_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refVan(m: any): BeoordelaarRef {
  return {
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    authUserId: m.auth_user_id ?? null,
  }
}

export async function haalBeoordelaar(medewerkerId: string): Promise<BeoordelaarRef | null> {
  const { data } = await db().from('medewerkers').select(VELDEN).eq('id', medewerkerId).maybeSingle()
  return data ? refVan(data) : null
}

/** Actieve directieleden, op achternaam. */
export async function haalDirectie(): Promise<BeoordelaarRef[]> {
  const { data } = await db()
    .from('medewerkers')
    .select(VELDEN)
    .eq('actief', true)
    .ilike('afdeling', DIRECTIE_AFDELING)
    .order('achternaam', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(refVan)
}

async function haalController(dossierId: string): Promise<BeoordelaarRef | null> {
  const { data } = await db().from('dossiers').select('controller_id').eq('id', dossierId).maybeSingle()
  return data?.controller_id ? haalBeoordelaar(data.controller_id) : null
}

/**
 * Beoordelingsroute voor een dossier. De directielijst wordt altijd meegegeven, ook
 * als er een controller is: overdragen mag dan nog steeds naar de directie.
 */
export async function bepaalBeoordelingsRoute(dossierId: string | null): Promise<BeoordelingsRoute> {
  const [controller, directie] = await Promise.all([
    dossierId ? haalController(dossierId) : Promise.resolve(null),
    haalDirectie(),
  ])
  return { controller, directie, keuzeNodig: controller == null && directie.length > 0 }
}

/**
 * Mag deze medewerker als beoordelaar worden aangewezen? Alleen de controller van het
 * dossier of een directielid — precies de mensen die volgens `autorisatie.ts` ook
 * werkelijk mogen accorderen. Voorkomt dat een aanvraag belandt bij iemand die er
 * niets mee kan.
 */
export async function magBeoordelaarZijn(dossierId: string | null, medewerkerId: string): Promise<boolean> {
  const route = await bepaalBeoordelingsRoute(dossierId)
  return route.controller?.id === medewerkerId || route.directie.some(d => d.id === medewerkerId)
}
