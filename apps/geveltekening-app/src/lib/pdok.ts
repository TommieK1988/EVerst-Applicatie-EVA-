/**
 * PDOK Locatieserver — open data van de Nederlandse overheid.
 * Geen API key nodig. Gebruikt voor adres-autocomplete en lookup.
 * Docs: https://github.com/PDOK/locatieserver/wiki/API-Locatieserver
 */

const LOCATIESERVER_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1'

export interface PdokSuggestion {
  id: string
  weergavenaam: string
  type: string
}

export interface PdokLookupResult {
  id: string
  weergavenaam: string
  type: string
  straatnaam?: string
  huisnummer?: number
  huisletter?: string
  huisnummertoevoeging?: string
  postcode?: string
  woonplaatsnaam?: string
  /** WGS84 longitude, latitude */
  centroide_ll?: string
  /** RD new (EPSG:28992) x, y */
  centroide_rd?: string
  adresseerbaarobject_id?: string
  nummeraanduiding_id?: string
  /** Pand (gebouw) ID's — een verblijfsobject kan in meerdere panden liggen */
  pandid?: string[] | string
}

function parsePointLL(wktPoint?: string): [number, number] | null {
  if (!wktPoint) return null
  const m = wktPoint.match(/POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

/**
 * Autocomplete suggesties voor een (gedeeltelijk) adres.
 * Retourneert IDs die we met lookup() kunnen ophalen.
 */
export async function suggestAddress(query: string): Promise<PdokSuggestion[]> {
  if (query.trim().length < 3) return []

  const url = new URL(`${LOCATIESERVER_BASE}/suggest`)
  url.searchParams.set('q', query)
  url.searchParams.set('fq', 'type:adres')
  url.searchParams.set('rows', '8')

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`PDOK suggest faalde: ${res.status}`)

  const data = await res.json()
  const docs: Array<{ id: string; weergavenaam: string; type: string }> = data?.response?.docs ?? []
  return docs
}

/**
 * Volledige adres-details ophalen op basis van een PDOK ID.
 */
export async function lookupAddress(id: string): Promise<PdokLookupResult | null> {
  const url = new URL(`${LOCATIESERVER_BASE}/lookup`)
  url.searchParams.set('id', id)
  url.searchParams.set(
    'fl',
    'id,weergavenaam,type,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,centroide_ll,centroide_rd,adresseerbaarobject_id,nummeraanduiding_id'
  )

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`PDOK lookup faalde: ${res.status}`)

  const data = await res.json()
  const doc: PdokLookupResult | undefined = data?.response?.docs?.[0]
  return doc ?? null
}

export function extractLonLat(result: PdokLookupResult): [number, number] | null {
  return parsePointLL(result.centroide_ll)
}

export function extractRdXY(result: PdokLookupResult): [number, number] | null {
  return parsePointLL(result.centroide_rd)
}
