/**
 * Extraheert gevels uit een pand-footprint (GeoJSON polygon).
 * Elk segment van de buitenring wordt behandeld als een gevel.
 *
 * Lengtes worden berekend via de haversine-formule (in meters).
 * Azimuth wordt berekend vanaf het noorden (0°) richting oosten (90°).
 */

import type { Facade, FacadeOrientation, GeoJsonPolygon } from './types'

const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Haversine afstand tussen 2 WGS84 punten in meters */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const lat1R = toRad(lat1)
  const lat2R = toRad(lat2)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1R) * Math.cos(lat2R) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Azimuth van punt A naar B, in graden vanaf noord (0..360) */
export function azimuthDegrees(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dLambda = toRad(lon2 - lon1)
  const y = Math.sin(dLambda) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  const theta = Math.atan2(y, x)
  return (toDeg(theta) + 360) % 360
}

/**
 * De azimuth van het gevelvlak zelf (loodrecht op segment, wijzend naar buiten).
 * We weten dat het polygon counter-clockwise georiënteerd is na normalisatie,
 * dan ligt "buiten" rechts van de richting A→B, dus azimuth + 90°.
 */
function facadeNormalAzimuth(segmentAzimuth: number): number {
  return (segmentAzimuth + 90) % 360
}

function compassFromAzimuth(az: number): FacadeOrientation['compass'] {
  const sectors: FacadeOrientation['compass'][] = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ]
  const idx = Math.round(az / 45) % 8
  return sectors[idx]
}

/** Bereken signed area (shoelace) in graden² — teken geeft oriëntatie aan */
function signedArea(ring: number[][]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += (x2 - x1) * (y2 + y1)
  }
  return sum / 2
}

/**
 * Splits footprint in gevels. Negeert segmenten korter dan minLengthMeters
 * (filter kleine hoeken en artefacten).
 */
export function extractFacades(
  footprint: GeoJsonPolygon,
  estimatedHeightMeters: number,
  minLengthMeters = 0.5
): Facade[] {
  const outer = footprint.coordinates[0]
  if (!outer || outer.length < 4) return []

  // Zorg voor counter-clockwise oriëntatie (positive shoelace area = CW in image coords,
  // maar in WGS84 lon-lat werkt het andersom). We normaliseren naar CCW.
  let ring = outer
  if (signedArea(ring) > 0) {
    ring = [...ring].reverse()
  }

  const facades: Facade[] = []
  let counter = 1

  for (let i = 0; i < ring.length - 1; i++) {
    const start: [number, number] = [ring[i][0], ring[i][1]]
    const end: [number, number] = [ring[i + 1][0], ring[i + 1][1]]
    const len = haversineMeters(start, end)
    if (len < minLengthMeters) continue

    const segAz = azimuthDegrees(start, end)
    const normalAz = facadeNormalAzimuth(segAz)
    const compass = compassFromAzimuth(normalAz)

    facades.push({
      id: `facade-${counter}`,
      label: `Gevel ${counter} (${compass})`,
      orientation: { compass, azimuthDegrees: normalAz },
      widthMeters: len,
      estimatedHeightMeters,
      startPoint: start,
      endPoint: end,
    })
    counter++
  }

  return facades
}
