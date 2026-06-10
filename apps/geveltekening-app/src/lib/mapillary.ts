/**
 * Mapillary Graph API — gratis crowd-sourced street-level foto's.
 * API docs: https://www.mapillary.com/developer/api-documentation
 * Verplicht: MAPILLARY_ACCESS_TOKEN environment variabele.
 */

const MAPILLARY_BASE = 'https://graph.mapillary.com'

export interface MapillaryImage {
  id: string
  thumbUrl: string
  capturedAt: number
  compassAngle: number
  /** [lon, lat] */
  coordinates: [number, number]
}

/**
 * Zoek foto's binnen een bounding box rond een punt, optioneel met camera-richting.
 * bboxRadiusMeters: halve zijde van de zoek-bbox (~30 m werkt goed voor gevels).
 */
export async function findImagesNear(
  lonLat: [number, number],
  options: {
    radiusMeters?: number
    targetAzimuthDegrees?: number
    azimuthToleranceDegrees?: number
    limit?: number
  } = {}
): Promise<MapillaryImage[]> {
  const token = process.env.MAPILLARY_ACCESS_TOKEN
  if (!token) {
    throw new Error('MAPILLARY_ACCESS_TOKEN niet ingesteld in environment')
  }

  const radius = options.radiusMeters ?? 30
  const limit = options.limit ?? 20
  const [lon, lat] = lonLat
  // ~111km per graad latitude; longitude schaalt met cos(lat)
  const dLat = radius / 111_000
  const dLon = radius / (111_000 * Math.cos((lat * Math.PI) / 180))
  const bbox = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`

  const url = new URL(`${MAPILLARY_BASE}/images`)
  url.searchParams.set('bbox', bbox)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('fields', 'id,thumb_1024_url,captured_at,compass_angle,geometry')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `OAuth ${token}` },
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    throw new Error(`Mapillary API faalde: ${res.status}`)
  }

  const data = await res.json()
  const images: MapillaryImage[] = (data?.data ?? []).map((img: any) => ({
    id: img.id,
    thumbUrl: img.thumb_1024_url,
    capturedAt: img.captured_at,
    compassAngle: img.compass_angle,
    coordinates: img.geometry?.coordinates ?? [lon, lat],
  }))

  if (options.targetAzimuthDegrees !== undefined) {
    const tol = options.azimuthToleranceDegrees ?? 60
    return images.filter((img) => {
      const diff = Math.abs(((img.compassAngle - options.targetAzimuthDegrees!) + 540) % 360 - 180)
      return diff <= tol
    })
  }

  return images
}
