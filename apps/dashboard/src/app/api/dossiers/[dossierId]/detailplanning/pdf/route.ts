import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { laadDetailplanning } from '@/lib/planning/detailplanning-gegevens'
import { laadPdfLogo } from '@/lib/planning/detailplanning-logo'
import { bouwDetailplanningPdf, detailplanningBestandsnaam } from '@/lib/planning/detailplanning-pdf'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/dossiers/<dossierId>/detailplanning/pdf
 *
 * De detailplanning van een dossier als liggende A3 — het vel dat je ophangt in de
 * keet of meeneemt naar een bouwvergadering. `?download=1` forceert opslaan in
 * plaats van openen in het tabblad.
 *
 * Object-level authz: de planning wordt met de admin-client opgebouwd (bypast RLS),
 * dus zonder deze check kan elke ingelogde gebruiker de planning van een willekeurig
 * dossier ophalen.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ dossierId: string }> }) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const { dossierId } = await params
  const gegevens = await laadDetailplanning(dossierId)
  if (!gegevens) return new NextResponse('Dossier niet gevonden', { status: 404 })
  if (gegevens.activiteiten.length === 0) {
    return new NextResponse('Dit dossier heeft nog geen planning', { status: 404 })
  }

  const logo = await laadPdfLogo(gegevens.bedrijf.logoUrl)

  const pdf = bouwDetailplanningPdf({
    kop: gegevens.kop,
    bedrijf: gegevens.bedrijf,
    fasen: gegevens.fasen,
    activiteiten: gegevens.activiteiten,
    uursoorten: gegevens.uursoorten,
    logo,
  })

  const naam = detailplanningBestandsnaam(gegevens.kop.dossiernummer, gegevens.kop.titel)
  const download = req.nextUrl.searchParams.get('download') === '1'

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(naam)}"`,
      'cache-control': 'no-store',
    },
  })
}
