/**
 * Bouw7 custom attributes (maatwerkvelden) — schrijfhulp.
 *
 * De attribuut-DEFINITIES (incl. numerieke `id`) lees je via **`GET /list/custom-attributes`**.
 * LET OP: `GET /organization/custom-attributes` bestaat niet (403 "Method Not Allowed (Allow: POST)" —
 * die route is create-only). Waarden schrijf je terug op het project via `POST /project` met
 * `customAttributeValues[]` (read-modify-write, zie `mergeCustomAttributeValue`).
 *
 * Geverifieerd tegen de live API (jul 2026): `caVveCode` = id 18874, `caEindverantwoordelijkeOfferte`
 * = id 20960 (beide ownerType 0 = project-niveau).
 */

/** Minimale client-vorm (alleen `get`) zodat we geen zware type-afhankelijkheid op de Bouw7Client hebben. */
type Bouw7Getter = { get: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T> }

/** Attribuut-definitie uit `GET /list/custom-attributes`. */
export type Bouw7CustomAttrDef = {
  id: number
  name?: string
  code?: string
  propertyName?: string
  ownerType?: number
}

/** Custom-attribuutwaarde zoals die op een Bouw7-project meekomt (`GET /project/{id}`). */
export type Bouw7CustomAttrValue = {
  id?: number
  customAttribute?: { id: number; name?: string; code?: string; propertyName?: string }
  value?: string | null
}

/** Normaliseer een Bouw7-respons naar een array (envelope `{items}` of kale array). */
function toItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const items = (res as { items?: unknown })?.items
  return Array.isArray(items) ? (items as T[]) : []
}

/** Alle custom-attribuut-definities (voor het resolven van een attribuut-id op naam/propertyName). */
export async function getCustomAttributeDefs(client: Bouw7Getter): Promise<Bouw7CustomAttrDef[]> {
  return toItems<Bouw7CustomAttrDef>(await client.get<unknown>('/list/custom-attributes'))
}

/** Zoek de id van het custom attribute dat `match` matcht (op naam/code/propertyName). `null` als niet gevonden. */
export async function resolveCustomAttributeId(
  client: Bouw7Getter,
  match: (d: Bouw7CustomAttrDef) => boolean,
): Promise<number | null> {
  const def = (await getCustomAttributeDefs(client)).find(match)
  return def?.id ?? null
}

/**
 * Bouw de `customAttributeValues[]` voor `POST /project`: zet het attribuut `attrId` op `value` en
 * behoud alle overige bestaande maatwerkvelden. Staat het attribuut nog niet op het project (bv. leeg,
 * Bouw7 laat lege waarden weg), dan wordt het toegevoegd.
 */
export function mergeCustomAttributeValue(
  bestaand: Bouw7CustomAttrValue[],
  attrId: number,
  value: string,
): { customAttribute: { id: number }; value: string }[] {
  const out = bestaand
    .filter((v) => v.customAttribute?.id != null)
    .map((v) => ({
      customAttribute: { id: v.customAttribute!.id },
      value: v.customAttribute!.id === attrId ? value : (v.value ?? ''),
    }))
  if (!out.some((v) => v.customAttribute.id === attrId)) {
    out.push({ customAttribute: { id: attrId }, value })
  }
  return out
}
