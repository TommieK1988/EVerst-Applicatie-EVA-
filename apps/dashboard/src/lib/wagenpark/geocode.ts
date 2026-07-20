import 'server-only'
import { pgQuery } from './db'

/**
 * Geocoding voor de wagenpark-werktijd-analyse.
 *
 * Adressen staan overal als vrije tekst (medewerker-woonadres, bedrijfsadres,
 * rit-start/-stop). Om "binnen X meter van werk/huis" te kunnen bepalen zetten
 * we die tekst om naar coördinaten via Nominatim (OpenStreetMap, gratis).
 *
 * Nominatim-gebruiksvoorwaarden: max ~1 request/seconde en een geldige
 * User-Agent met contact. Daarom throttelen we live-calls en cachen we élk
 * resultaat (ook "geen match") in public.geocode_cache, zodat hetzelfde adres
 * nooit twee keer wordt opgevraagd. Cache-lookups gaan via de directe pooler
 * (pgQuery), consistent met de rest van de wagenpark-module.
 */

export type GeoPunt = { lat: number; lng: number }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
// Nominatim vereist een identificeerbare User-Agent met contactgegeven.
const USER_AGENT = 'EVA-Wagenpark/1.0 (+https://eva.everts.nl; wagenpark@everts.nl)'
const THROTTLE_MS = 1100

let laatsteCall = 0

async function throttle(): Promise<void> {
  const wacht = THROTTLE_MS - (Date.now() - laatsteCall)
  if (wacht > 0) await new Promise((r) => setTimeout(r, wacht))
  laatsteCall = Date.now()
}

function normQuery(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Bouw een geocode-query uit losse adresonderdelen (NL-context). */
export function adresQuery(
  straat?: string | null,
  postcode?: string | null,
  plaats?: string | null,
): string {
  const regel2 = [postcode, plaats].filter((p) => p && p.trim()).join(' ')
  const base = [straat, regel2].filter((p) => p && p.trim()).join(', ')
  return base ? `${base}, Nederland` : ''
}

type CacheUitkomst = { hit: boolean; punt: GeoPunt | null }

async function uitCache(query: string): Promise<CacheUitkomst> {
  const rows = await pgQuery<{ lat: number | null; lng: number | null }>(
    `select lat, lng from public.geocode_cache where query = $1`,
    [normQuery(query)],
  )
  if (rows.length === 0) return { hit: false, punt: null }
  const r = rows[0]
  if (r.lat == null || r.lng == null) return { hit: true, punt: null }
  return { hit: true, punt: { lat: r.lat, lng: r.lng } }
}

async function naarCache(query: string, punt: GeoPunt | null, bron: string): Promise<void> {
  await pgQuery(
    `insert into public.geocode_cache (query, lat, lng, bron)
       values ($1, $2, $3, $4)
     on conflict (query) do update set
       lat = excluded.lat, lng = excluded.lng, bron = excluded.bron, aangemaakt_op = now()`,
    [normQuery(query), punt?.lat ?? null, punt?.lng ?? null, bron],
  )
}

/**
 * Geocode een vrije-tekst-query (met cache). Geeft null bij geen match.
 * Transiente HTTP-fouten worden NIET gecachet (zodat een latere run het opnieuw
 * probeert); een echte "geen resultaat" wordt wél gecachet als null-punt.
 */
export async function geocodeQuery(query: string): Promise<GeoPunt | null> {
  const q = query.trim()
  if (!q) return null

  const cache = await uitCache(q)
  if (cache.hit) return cache.punt

  await throttle()
  try {
    const url = new URL(NOMINATIM)
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'nl,de,be')
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'nl' },
    })
    if (!res.ok) return null // transient — niet cachen

    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const first = Array.isArray(data) ? data[0] : null
    const lat = first?.lat != null ? parseFloat(first.lat) : NaN
    const lng = first?.lon != null ? parseFloat(first.lon) : NaN
    const punt = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null

    await naarCache(q, punt, 'nominatim')
    return punt
  } catch {
    return null // netwerkfout — niet cachen
  }
}

/** Geocode een adres uit losse onderdelen. */
export async function geocodeAdres(
  straat?: string | null,
  postcode?: string | null,
  plaats?: string | null,
): Promise<GeoPunt | null> {
  const q = adresQuery(straat, postcode, plaats)
  return q ? geocodeQuery(q) : null
}

export type GeocodeReferentieResultaat = {
  medewerkers_ok: number
  medewerkers_geen_match: number
  bedrijven_ok: number
  bedrijven_geen_match: number
}

/**
 * (Her)geocodeer alle woonadressen (medewerkers) en werkadressen
 * (bedrijfsgegevens) en sla de coördinaten op. Dankzij de cache is herhaald
 * draaien goedkoop; alleen gewijzigde adressen leiden tot een nieuwe call.
 * Bedoeld voor de handmatige "(her)geocodeer"-knop in de instellingen.
 */
export async function geocodeReferentieadressen(): Promise<GeocodeReferentieResultaat> {
  const res: GeocodeReferentieResultaat = {
    medewerkers_ok: 0,
    medewerkers_geen_match: 0,
    bedrijven_ok: 0,
    bedrijven_geen_match: 0,
  }

  const medewerkers = await pgQuery<{
    id: string
    adres_straat: string | null
    adres_postcode: string | null
    adres_plaats: string | null
  }>(
    `select id, adres_straat, adres_postcode, adres_plaats
       from public.medewerkers
      where actief = true
        and (adres_straat is not null or adres_plaats is not null)`,
  )
  for (const m of medewerkers) {
    const punt = await geocodeAdres(m.adres_straat, m.adres_postcode, m.adres_plaats)
    await pgQuery(
      `update public.medewerkers
          set adres_lat = $2, adres_lng = $3, geocode_status = $4, geocode_op = now()
        where id = $1`,
      [m.id, punt?.lat ?? null, punt?.lng ?? null, punt ? 'ok' : 'geen_match'],
    )
    if (punt) res.medewerkers_ok++
    else res.medewerkers_geen_match++
  }

  const bedrijven = await pgQuery<{
    id: string
    adres_straat: string | null
    adres_postcode: string | null
    adres_plaats: string | null
  }>(
    `select id, adres_straat, adres_postcode, adres_plaats
       from public.bedrijfsgegevens
      where adres_straat is not null or adres_plaats is not null`,
  )
  for (const b of bedrijven) {
    const punt = await geocodeAdres(b.adres_straat, b.adres_postcode, b.adres_plaats)
    await pgQuery(
      `update public.bedrijfsgegevens
          set adres_lat = $2, adres_lng = $3, geocode_status = $4, geocode_op = now()
        where id = $1`,
      [b.id, punt?.lat ?? null, punt?.lng ?? null, punt ? 'ok' : 'geen_match'],
    )
    if (punt) res.bedrijven_ok++
    else res.bedrijven_geen_match++
  }

  return res
}
