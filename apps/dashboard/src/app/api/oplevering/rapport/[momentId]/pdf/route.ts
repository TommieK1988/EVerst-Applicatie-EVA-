import { NextResponse } from 'next/server'
import { getOplevermomentRapport } from '@/lib/dossiers/oplevering'
import { genereerOpleverRapportPdf, opleverRapportBestandsnaam } from '@/lib/dossiers/oplever-rapport-pdf'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/oplevering/rapport/<momentId>/pdf
 *
 * De opleverrapportage als PDF — exact het bestand dat als bijlage bij de rapportage-mail gaat.
 * Achter de EVA-login (middleware), dus intern. `?download=1` forceert opslaan i.p.v. inline tonen.
 */
export async function GET(req: Request, { params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params

  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return new NextResponse('Oplevermoment niet gevonden', { status: 404 })

  const pdf = await genereerOpleverRapportPdf(momentId)
  if (!pdf) return new NextResponse('Rapport kon niet worden opgebouwd', { status: 500 })

  const naam = opleverRapportBestandsnaam(rapport.dossier.nummer, rapport.moment.titel)
  const download = new URL(req.url).searchParams.get('download') === '1'

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(naam)}"`,
      'cache-control': 'no-store',
    },
  })
}
