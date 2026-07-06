/**
 * Bouw7 — relatie/contactpersoon aanmaken (EVA → Bouw7).
 *
 * `POST /contact` (upsert: géén `id` = create) en `POST /contact/{contact}/contact-person`.
 * Best-effort: faalt de Bouw7-kant, dan blijft de EVA-relatie bestaan (aanroeper logt/negeert).
 *
 * Bouw7 vereist `contactType { id }` bij een relatie maar publiceert geen enum. We leiden de
 * juiste type-id af van een bestaande relatie van hetzelfde EVA-type (data-driven i.p.v. gokken).
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Contact, Bouw7ListResponse } from '@/lib/bouw7/client'
import type { OrganisatieType } from '@everts/database'

/** Bouw7 contactType-naam → EVA-organisatietype (spiegelt mapContactType in sync.ts). */
function mapType(typeName?: string): OrganisatieType {
  switch ((typeName ?? '').toLowerCase()) {
    case 'supplier':      return 'leverancier'
    case 'subcontractor': return 'onderaannemer'
    default:              return 'opdrachtgever'
  }
}

/** Zoek een geldige Bouw7 contactType-id voor een EVA-organisatietype door een bestaande relatie te hergebruiken. */
async function resolveContactTypeId(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
  evaType: OrganisatieType,
): Promise<number | null> {
  const items = (await client.get<Bouw7ListResponse<Bouw7Contact>>('/list/contacts', { q: 'LIMIT 200' })).items ?? []
  const match = items.find((c) => c.type?.id != null && mapType(c.type?.name) === evaType)
  return match?.type?.id ?? null
}

export type Bouw7RelatieCreateInput = {
  naam: string
  types: OrganisatieType[]
  kvk_nummer?: string | null
  btw_nummer?: string | null
  email?: string | null
  telefoon?: string | null
  adres_straat?: string | null
  adres_huisnummer?: string | null
  adres_postcode?: string | null
  adres_plaats?: string | null
  adres_land?: string | null
  opmerkingen?: string | null
}

/**
 * Maak een relatie in Bouw7 aan. Retourneert het Bouw7-contact-id of null (best-effort).
 * Het primaire EVA-type (eerste in `types`, default opdrachtgever) bepaalt het contactType.
 */
export async function maakBouw7Relatie(input: Bouw7RelatieCreateInput): Promise<number | null> {
  try {
    const client = await getBouw7Client()
    const evaType = input.types[0] ?? 'opdrachtgever'
    const contactTypeId = await resolveContactTypeId(client, evaType)
    if (contactTypeId == null) return null // zonder geldig type geen create

    const body: Record<string, unknown> = {
      name: input.naam,
      contactType: { id: contactTypeId },
    }
    if (input.kvk_nummer)      body.cocNumber = input.kvk_nummer
    if (input.btw_nummer)      body.vatNumber = input.btw_nummer
    if (input.email)           body.email = input.email
    if (input.telefoon)        body.phoneNumber = input.telefoon
    if (input.adres_straat)    body.streetName = input.adres_straat
    if (input.adres_huisnummer)body.houseNumber = input.adres_huisnummer
    if (input.adres_postcode)  body.zipCode = input.adres_postcode
    if (input.adres_plaats)    body.city = input.adres_plaats
    if (input.adres_land)      body.countryCode = input.adres_land
    if (input.opmerkingen)     body.information = input.opmerkingen

    const created = await client.post<{ id?: number }>('/contact', body)
    return created?.id ?? null
  } catch {
    return null
  }
}

export type Bouw7ContactpersoonCreateInput = {
  voornaam: string
  achternaam: string
  email?: string | null
  telefoon?: string | null
  functie?: string | null
  aanhef?: string | null
}

/**
 * Maak een contactpersoon onder een bestaand Bouw7-contact aan. Retourneert het Bouw7-id of null.
 * Vereist het Bouw7-id van de moederrelatie.
 */
export async function maakBouw7Contactpersoon(
  parentBouw7Id: number,
  input: Bouw7ContactpersoonCreateInput,
): Promise<number | null> {
  try {
    const client = await getBouw7Client()
    const body: Record<string, unknown> = {
      firstName: input.voornaam,
      lastName: input.achternaam,
    }
    if (input.email)    body.email = input.email
    if (input.telefoon) body.phoneNumber = input.telefoon
    if (input.functie)  body.jobTitle = input.functie
    if (input.aanhef)   body.salutation = input.aanhef

    const created = await client.post<{ id?: number }>(`/contact/${parentBouw7Id}/contact-person`, body)
    return created?.id ?? null
  } catch {
    return null
  }
}
