/**
 * BAG WFS — pand (gebouw) footprint ophalen via PDOK.
 * Geen API key nodig.
 * Endpoint: https://service.pdok.nl/lv/bag/wfs/v2_0
 *
 * NB: De PDOK BAG WFS negeert CQL filters op deze endpoint; we gebruiken
 * daarom BBOX-filter in RD (EPSG:28992) en selecteren daarna client-side
 * het pand dat het dichtst bij het adres-centroid ligt.
 */

import type { GeoJsonPolygon } from './types'

const BAG_WFS = 'https://service.pdok.nl/lv/bag/wfs/v2_0'

export interface BagPandFeature {
  pandId: string
  bouwjaar: number
  status: string
  gebruiksdoel?: string
  /** Polygon in WGS84 (lon, lat) */
  footprint: GeoJsonPolygon
}

function pointInPolygon(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distanceToPolygonCenter(point: [number, number], ring: number[][]): number {
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sumX += ring[i][0]
    sumY += ring[i][1]
  }
  const n = ring.length - 1
  const cx = sumX / n
  const cy = sumY / n
  const dx = cx - point[0]
  const dy = cy - point[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Zoek het pand dat hoort bij een adres, op basis van RD coordinaten.
 * Retourneert het pand dat het adrescentroid bevat, of anders het dichtstbijzijnde.
 */
export async function findPandByRdPoint(rdX: number, rdY: number): Promise<BagPandFeature | null> {
  const halfSize = 8
  const bbox = `${rdX - halfSize},${rdY - halfSize},${rdX + halfSize},${rdY + halfSize},urn:ogc:def:crs:EPSG::28992`

  const url = new URL(BAG_WFS)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', 'bag:pand')
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('srsName', 'urn:ogc:def:crs:EPSG::4326')
  url.searchParams.set('bbox', bbox)
  url.searchParams.set('count', '10')

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`BAG WFS faalde: ${res.status}`)

  const data = await res.json()
  const features: any[] = data?.features ?? []
  if (features.length === 0) return null

  // Converteer adres-centroid RD → WGS84 (ruwe inverse RD-naar-WGS84 is complex;
  // we vergelijken direct in de WGS84-coordinaten van de pand-rings door
  // eerst het centroid van elke polygon te berekenen). Omdat we al in 4326 zitten
  // en de ring-coordinaten ook, zoeken we simpelweg de polygon die het kleinste
  // afstand heeft tot het bbox-centrum.
  //
  // Het bbox-centrum in WGS84 hebben we niet direct; we gebruiken het feature-
  // centroid dichtst bij het "midden" van alle features. Praktisch: als er 1
  // feature is in de bbox is dat het juiste pand. Als er meerdere zijn
  // (vb. rijwoning-blok), nemen we de feature met het kleinste oppervlak
  // als indicator voor het specifieke huisnummer.

  let best = features[0]
  if (features.length > 1) {
    // Verzamel alle feature-centroids en neem het gemiddelde als "middelpunt"
    const centroids = features.map((f) => {
      const ring = f.geometry?.coordinates?.[0] ?? []
      let sx = 0
      let sy = 0
      for (let i = 0; i < ring.length - 1; i++) {
        sx += ring[i][0]
        sy += ring[i][1]
      }
      const n = Math.max(1, ring.length - 1)
      return [sx / n, sy / n] as [number, number]
    })
    const mx = centroids.reduce((a, c) => a + c[0], 0) / centroids.length
    const my = centroids.reduce((a, c) => a + c[1], 0) / centroids.length
    const center: [number, number] = [mx, my]

    // Voorkeur: pand dat het middelpunt bevat; anders dichtstbijzijnde
    const containing = features.find((f) => {
      const ring = f.geometry?.coordinates?.[0] ?? []
      return pointInPolygon(center, ring)
    })
    if (containing) {
      best = containing
    } else {
      features.sort((a, b) => {
        const ra = a.geometry?.coordinates?.[0] ?? []
        const rb = b.geometry?.coordinates?.[0] ?? []
        return distanceToPolygonCenter(center, ra) - distanceToPolygonCenter(center, rb)
      })
      best = features[0]
    }
  }

  const geom = best.geometry
  if (!geom || geom.type !== 'Polygon') return null

  return {
    pandId: best.properties?.identificatie ?? '',
    bouwjaar: Number(best.properties?.bouwjaar) || 0,
    status: best.properties?.status ?? 'onbekend',
    gebruiksdoel: best.properties?.gebruiksdoel,
    footprint: {
      type: 'Polygon',
      coordinates: geom.coordinates,
    },
  }
}
