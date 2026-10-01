import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'
import { geocodeAdres, geocodeQuery, type GeoPunt } from '@/lib/wagenpark/geocode'

/**
 * Geocoding voor dossier-werkadressen.
 *
 * Voor "dossier openen op locatie" (mobiele buitendienst) hebben we de
 * werkadressen als coördinaten nodig. Ze staan als vrije tekst op
 * `public.dossiers` (werkadres_straat/_huisnummer/_postcode/_stad). We
 * hergebruiken de wagenpark-geocoder (Nominatim + public.geocode_cache) — die
 * throttelt op ~1 request/seconde en cachet elk resultaat (ook "geen match").
 *
 * Een dossier wordt maximaal één keer geprobeerd: `geocode_status` gaat naar
 * 'ok' of 'geen_match'. De incrementele batch pakt alleen wat nog nooit
 * geprobeerd is (geocode_status is null). De DB-trigger
 * `dossiers_geocode_reset_trg` zet die status weer op null zodra het werkadres
 * wijzigt, zodat een gewijzigd adres vanzelf opnieuw wordt opgehaald.
 */

/** Nederlandse 6-positie-postcode (PC6), bijv. "2518 PB" — straatsegment-precies. */
const PC6 = /^[0-9]{4}\s?[a-z]{2}$/i

/**
 * Postcode-fallback-query. Corporatie-werkadressen zijn vaak te rommelig voor
 * Nominatim (meerdere straten aan elkaar, "kamer 12"-toevoegingen, nummerreeksen),
 * maar de PC6-postcode is heel precies. Geeft '' als er geen bruikbare PC6 is.
 */
function postcodeQuery(postcode?: string | null, plaats?: string | null): string {
  const pc = (postcode ?? '').trim()
  if (!PC6.test(pc)) return ''
  const base = [pc, (plaats ?? '').trim()].filter((p) => p).join(' ')
  return `${base}, Nederland`
}

/**
 * Eén werkadres naar coördinaten: eerst het volledige adres, dan de PC6-postcode als vangnet.
 * Gedeeld door het hoofdadres (`dossiers`) en de extra werkadressen (`dossier_werkadressen`).
 */
export async function geocodeWerkadres(
  straat: string | null,
  huisnummer: string | null,
  postcode: string | null,
  stad: string | null,
): Promise<GeoPunt | null> {
  // Bouw7 levert straat en huisnummer apart; Nominatim wil ze samen. Staat het nummer al in de
  // straat, dan niet dubbel.
  const st = (straat ?? '').trim()
  const hn = (huisnummer ?? '').trim()
  const volledig = hn && !st.endsWith(hn) ? `${st} ${hn}`.trim() : st
  const punt = await geocodeAdres(volledig || null, postcode, stad)
  if (punt) return punt
  // Lukt het volledige adres niet, val terug op de (precieze) PC6-postcode.
  const pq = postcodeQuery(postcode, stad)
  return pq ? geocodeQuery(pq) : null
}

export type GeocodeDossiersResultaat = {
  verwerkt: number
  ok: number
  geen_match: number
  /** Dossiers die na deze ronde nog niet geprobeerd zijn. */
  resterend: number
}

/**
 * (Her)geocodeer werkadressen van dossiers en sla de coördinaten op.
 * Standaard incrementeel (alleen nog niet geprobeerde dossiers); `opnieuw`
 * forceert álle niet-gearchiveerde dossiers met een werkadres.
 *
 * Nominatim staat ~1 request/seconde toe, dus `max` begrenst de looptijd — de
 * cron roept dit elke ronde aan tot `resterend` op 0 staat.
 */
export async function geocodeDossiers(
  opties: { max?: number; opnieuw?: boolean } = {},
): Promise<GeocodeDossiersResultaat> {
  const max = opties.max ?? 40
  const alleenNieuw = !opties.opnieuw

  const rows = await pgQuery<{
    id: string
    werkadres_straat: string | null
    werkadres_huisnummer: string | null
    werkadres_postcode: string | null
    werkadres_stad: string | null
  }>(
    `select id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad
       from public.dossiers
      where gearchiveerd is not true
        and (werkadres_straat is not null or werkadres_stad is not null)
        ${alleenNieuw ? 'and geocode_status is null' : ''}
      order by updated_at desc nulls last
      limit $1`,
    [max],
  )

  const res: GeocodeDossiersResultaat = { verwerkt: 0, ok: 0, geen_match: 0, resterend: 0 }

  for (const d of rows) {
    const punt = await geocodeWerkadres(d.werkadres_straat, d.werkadres_huisnummer, d.werkadres_postcode, d.werkadres_stad)
    await pgQuery(
      `update public.dossiers
          set adres_lat = $2, adres_lng = $3, geocode_status = $4, geocode_op = now()
        where id = $1`,
      [d.id, punt?.lat ?? null, punt?.lng ?? null, punt ? 'ok' : 'geen_match'],
    )
    res.verwerkt++
    if (punt) res.ok++
    else res.geen_match++
  }

  const rest = await pgQuery<{ n: number }>(
    `select count(*)::int as n
       from public.dossiers
      where gearchiveerd is not true
        and (werkadres_straat is not null or werkadres_stad is not null)
        and geocode_status is null`,
  )
  res.resterend = rest[0]?.n ?? 0

  return res
}

/**
 * Vangnet voor de extra werkadressen: de server-action geocodeert direct na opslaan, maar als
 * Nominatim dan niet bereikbaar was blijft `geocode_status` null en pakt de cron hem hier op.
 */
export async function geocodeExtraWerkadressen(opties: { max?: number } = {}): Promise<{ verwerkt: number; ok: number }> {
  const rows = await pgQuery<{
    id: string
    straat: string | null
    huisnummer: string | null
    postcode: string | null
    stad: string | null
  }>(
    `select id, straat, huisnummer, postcode, stad
       from public.dossier_werkadressen
      where geocode_status is null
        and (straat is not null or postcode is not null or stad is not null)
      order by bijgewerkt_op desc
      limit $1`,
    [opties.max ?? 20],
  )
  let ok = 0
  for (const r of rows) {
    const punt = await geocodeWerkadres(r.straat, r.huisnummer, r.postcode, r.stad)
    await pgQuery(
      `update public.dossier_werkadressen
          set lat = $2, lng = $3, geocode_status = $4, geocode_op = now()
        where id = $1`,
      [r.id, punt?.lat ?? null, punt?.lng ?? null, punt ? 'ok' : 'geen_match'],
    )
    if (punt) ok++
  }
  return { verwerkt: rows.length, ok }
}
