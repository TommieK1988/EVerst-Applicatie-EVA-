import { NextRequest, NextResponse } from 'next/server'
import { findImagesNear } from '@/lib/mapillary'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') ?? '')
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const azimuth = req.nextUrl.searchParams.get('azimuth')

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: 'lon/lat parameters ontbreken' }, { status: 400 })
  }

  try {
    const images = await findImagesNear([lon, lat], {
      radiusMeters: 30,
      targetAzimuthDegrees: azimuth ? parseFloat(azimuth) : undefined,
      azimuthToleranceDegrees: 60,
      limit: 12,
    })
    return NextResponse.json({ images })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    const status = message.includes('MAPILLARY_ACCESS_TOKEN') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
