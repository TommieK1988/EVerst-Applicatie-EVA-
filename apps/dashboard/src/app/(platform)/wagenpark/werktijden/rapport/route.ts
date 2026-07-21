import { NextRequest, NextResponse } from 'next/server'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import {
  genereerWerktijdRapportPdf,
  werktijdRapportBestandsnaam,
} from '@/lib/wagenpark/werktijd-rapport-pdf'

export const dynamic = 'force-dynamic'

/**
 * GET /wagenpark/werktijden/rapport?jaar=YYYY&maand=M
 *
 * Streamt het maandelijkse werktijd-PDF. AVG-gevoelig → alleen Directie/beheer.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await magPriveRittenZien())) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const jaar = Number(req.nextUrl.searchParams.get('jaar'))
  const maand = Number(req.nextUrl.searchParams.get('maand'))
  if (!Number.isInteger(jaar) || !Number.isInteger(maand) || maand < 1 || maand > 12) {
    return NextResponse.json({ error: 'jaar en maand (1-12) zijn vereist' }, { status: 400 })
  }

  const pdf = await genereerWerktijdRapportPdf(jaar, maand)
  if (!pdf) {
    return NextResponse.json({ error: 'Geen rapport voor deze maand' }, { status: 404 })
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${werktijdRapportBestandsnaam(jaar, maand)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
