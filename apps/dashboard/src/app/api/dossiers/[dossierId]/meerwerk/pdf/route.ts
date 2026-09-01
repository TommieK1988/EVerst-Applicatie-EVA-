import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import {
  genereerMeerwerkOverzichtPdf,
  getMeerwerkOverzichtDossier,
  meerwerkOverzichtBestandsnaam,
} from '@/lib/dossiers/meerwerk-overzicht-pdf'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/dossiers/<dossierId>/meerwerk/pdf
 *
 * Het meerwerkoverzicht voor de opdrachtgever als PDF. `?kop=` zet een vrije inleiding boven de
 * tabel, `?download=1` forceert opslaan in plaats van openen in het tabblad.
 *
 * Object-level authz: het overzicht wordt met de admin-client opgebouwd (bypast RLS), dus zonder
 * deze check kan elke ingelogde gebruiker de meerwerkbedragen van willekeurige dossiers ophalen.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ dossierId: string }> }) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const { dossierId } = await params
  const dossier = await getMeerwerkOverzichtDossier(dossierId)
  if (!dossier) return new NextResponse('Dossier niet gevonden', { status: 404 })

  // Ruim genomen bovengrens: een koptekst is een inleiding, geen bijlage.
  const kop = (req.nextUrl.searchParams.get('kop') ?? '').slice(0, 2000)
  const pdf = await genereerMeerwerkOverzichtPdf(dossierId, kop)
  if (!pdf) return new NextResponse('Overzicht kon niet worden opgebouwd', { status: 500 })

  const naam = meerwerkOverzichtBestandsnaam(dossier.nummer, dossier.titel)
  const download = req.nextUrl.searchParams.get('download') === '1'

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(naam)}"`,
      'cache-control': 'no-store',
    },
  })
}
