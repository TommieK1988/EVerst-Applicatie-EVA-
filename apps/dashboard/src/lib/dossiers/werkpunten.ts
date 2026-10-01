import { afstandMeter } from '@/lib/geo/afstand'

/**
 * De plekken waar aan een dossier gewerkt wordt: het hoofdadres (werkadres_* op `dossiers`) plus
 * de extra werkadressen uit `dossier_werkadressen`. Een geclusterde opdracht — meerdere
 * vestigingen, verspreid bezit — heeft er meer dan één, en de prikklok en "openen op locatie"
 * moeten dan op élk van die plekken werken.
 *
 * Bewust zonder database: de aanroepers halen de rijen zelf op (begrensd), dit rekent alleen.
 */

export type Werkpunt = {
  /** null = het hoofdadres van het dossier. */
  werkadresId: string | null
  naam: string | null
  adres: string | null
  /** Postcode + huisnummer genormaliseerd, voor het groeperen van buurpanden. */
  sleutel: string | null
  lat: number
  lng: number
}

export type HoofdadresVelden = {
  werkadres_straat?: string | null
  werkadres_huisnummer?: string | null
  werkadres_postcode?: string | null
  werkadres_stad?: string | null
  adres_lat: number | null
  adres_lng: number | null
}

export type ExtraWerkadresVelden = {
  id: string
  naam?: string | null
  straat?: string | null
  huisnummer?: string | null
  postcode?: string | null
  stad?: string | null
  lat: number | null
  lng: number | null
}

/** "Straat 12, Plaats" — het huisnummer staat soms al in het straatveld (Bouw7-invoer). */
export function adresRegel(straat?: string | null, huisnummer?: string | null, stad?: string | null): string | null {
  const st = (straat ?? '').trim()
  const hn = (huisnummer ?? '').trim()
  const metNummer = hn && !st.endsWith(hn) ? `${st} ${hn}`.trim() : st
  return [metNummer, (stad ?? '').trim()].filter(Boolean).join(', ') || null
}

function adresSleutel(postcode?: string | null, huisnummer?: string | null): string | null {
  const pc = (postcode ?? '').replace(/\s+/g, '').toLowerCase()
  const hn = (huisnummer ?? '').replace(/\s+/g, '').toLowerCase()
  return pc && hn ? `${pc}|${hn}` : null
}

/** Alle punten mét coördinaten; het hoofdadres eerst. */
export function werkpuntenVan(hoofd: HoofdadresVelden | null, extra: ExtraWerkadresVelden[] = []): Werkpunt[] {
  const punten: Werkpunt[] = []
  if (hoofd && hoofd.adres_lat != null && hoofd.adres_lng != null) {
    punten.push({
      werkadresId: null,
      naam: null,
      adres: adresRegel(hoofd.werkadres_straat, hoofd.werkadres_huisnummer, hoofd.werkadres_stad),
      sleutel: adresSleutel(hoofd.werkadres_postcode, hoofd.werkadres_huisnummer),
      lat: hoofd.adres_lat,
      lng: hoofd.adres_lng,
    })
  }
  for (const e of extra) {
    if (e.lat == null || e.lng == null) continue
    punten.push({
      werkadresId: e.id,
      naam: e.naam?.trim() || null,
      adres: adresRegel(e.straat, e.huisnummer, e.stad),
      sleutel: adresSleutel(e.postcode, e.huisnummer),
      lat: e.lat,
      lng: e.lng,
    })
  }
  return punten
}

/** Het dichtstbijzijnde punt en de afstand ernaartoe; null als er geen enkel punt is. */
export function dichtstbijzijnd(
  pos: { lat: number; lng: number },
  punten: Werkpunt[],
): { punt: Werkpunt; afstand: number } | null {
  let beste: { punt: Werkpunt; afstand: number } | null = null
  for (const punt of punten) {
    const afstand = afstandMeter(pos.lat, pos.lng, punt.lat, punt.lng)
    if (!beste || afstand < beste.afstand) beste = { punt, afstand }
  }
  return beste
}

/** "Vestiging Zwolle — Kerkstraat 1, Zwolle", of alleen het adres als er geen naam is. */
export function puntLabel(punt: Pick<Werkpunt, 'naam' | 'adres'>): string | null {
  return [punt.naam, punt.adres].filter(Boolean).join(' — ') || null
}
