import { NextRequest, NextResponse } from 'next/server'
import { lookupAddress, extractRdXY } from '@/lib/pdok'
import { findPandByRdPoint } from '@/lib/bag-wfs'
import { getHeightsByPandId } from '@/lib/bag3d'
import { extractFacades } from '@/lib/facade-extraction'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id parameter ontbreekt' }, { status: 400 })
  }

  try {
    const address = await lookupAddress(id)
    if (!address) {
      return NextResponse.json({ error: 'Adres niet gevonden' }, { status: 404 })
    }

    const rdPoint = extractRdXY(address)
    if (!rdPoint) {
      return NextResponse.json({ error: 'Geen coordinaten bij adres' }, { status: 404 })
    }

    const pand = await findPandByRdPoint(rdPoint[0], rdPoint[1])
    if (!pand) {
      return NextResponse.json({ error: 'Pand-geometrie niet gevonden' }, { status: 404 })
    }

    const heights = await getHeightsByPandId(pand.pandId)
    const estimatedHeight = heights?.totalHeightAboveGround ?? 6
    const facades = extractFacades(pand.footprint, estimatedHeight)

    return NextResponse.json({
      address,
      pand: {
        pandId: pand.pandId,
        bouwjaar: pand.bouwjaar,
        status: pand.status,
        gebruiksdoel: pand.gebruiksdoel,
        footprint: pand.footprint,
      },
      heights,
      facades,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
