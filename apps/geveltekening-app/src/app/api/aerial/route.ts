import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Proxy naar PDOK Luchtfoto WMS (Actueel_orthoHR — 25cm resolutie RGB).
 * Gratis, geen key. We proxyen om CORS/betrouwbaarheid te borgen en het image
 * direct als <img> src te kunnen gebruiken in de SVG preview.
 *
 * Query params: bbox=minLon,minLat,maxLon,maxLat, w=width, h=height
 */
export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  const w = req.nextUrl.searchParams.get('w') ?? '640'
  const h = req.nextUrl.searchParams.get('h') ?? '640'

  if (!bbox) {
    return NextResponse.json({ error: 'bbox parameter ontbreekt' }, { status: 400 })
  }

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'ongeldige bbox' }, { status: 400 })
  }

  const wms = new URL('https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0')
  wms.searchParams.set('SERVICE', 'WMS')
  wms.searchParams.set('VERSION', '1.1.1')
  wms.searchParams.set('REQUEST', 'GetMap')
  wms.searchParams.set('LAYERS', 'Actueel_orthoHR')
  wms.searchParams.set('STYLES', '')
  wms.searchParams.set('SRS', 'EPSG:4326')
  wms.searchParams.set('BBOX', bbox)
  wms.searchParams.set('WIDTH', w)
  wms.searchParams.set('HEIGHT', h)
  wms.searchParams.set('FORMAT', 'image/jpeg')

  try {
    const upstream = await fetch(wms.toString(), {
      next: { revalidate: 86400 },
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Luchtfoto WMS faalde: ${upstream.status}` },
        { status: 502 }
      )
    }
    const buf = await upstream.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
