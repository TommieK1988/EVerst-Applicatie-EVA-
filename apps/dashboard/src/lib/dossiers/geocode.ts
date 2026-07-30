import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'
import { geocodeAdres } from '@/lib/wagenpark/geocode'

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
    // Bouw7 levert straat en huisnummer apart; Nominatim wil ze samen.
    const straat = [d.werkadres_straat, d.werkadres_huisnummer]
      .filter((s) => s && s.trim())
      .join(' ')
    const punt = await geocodeAdres(straat || null, d.werkadres_postcode, d.werkadres_stad)
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
