/**
 * Werktijden van één bestuurder als PDF — de uitdraai die je meeneemt naar een
 * functionerings- of beoordelingsgesprek.
 *
 * Leest exact dezelfde rijen als het werktijden-blok op de bestuurderpagina
 * (`laadWerktijdGegevens`), zodat het papier en het beeldscherm nooit uiteen
 * kunnen lopen. De opmaak zelf staat in `lib/wagenpark/werktijden-pdf.ts`.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { urlNaarBase64 } from '@/components/formulieren/pdf-schema'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { laadWerktijdGegevens } from '@/lib/wagenpark/werktijd-bevindingen'
import { bepaalPeriode } from '@/lib/wagenpark/periode'
import { bouwWerktijdenPdf, werktijdenPdfBestandsnaam } from '@/lib/wagenpark/werktijden-pdf'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Zelfde poort als het blok op de bestuurderpagina: aankomst- en
  // vertrektijden met een naam erbij zijn privacygevoelig. De PDF wordt met
  // verhoogde rechten gebouwd, dus deze controle staat er niet voor de sier.
  if (!(await magPriveRittenZien())) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Onbekende bestuurder' }, { status: 400 })
  }

  const url = new URL(req.url)
  const periode = bepaalPeriode({
    periode: url.searchParams.get('periode') ?? undefined,
    van: url.searchParams.get('van') ?? undefined,
    tot: url.searchParams.get('tot') ?? undefined,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [gegevens, naamRijen, bedrijfResult] = await Promise.all([
    laadWerktijdGegevens(periode.van, periode.tot, id),
    pgQuery<{ naam: string }>(
      `select volledige_naam as naam from public.ulu_users where id::text = $1`,
      [id],
    ),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  const naam = naamRijen[0]?.naam ?? `Bestuurder #${id}`
  const bedrijf = bedrijfResult.data as
    | { naam: string | null; logo_primair_url: string | null; logo_url: string | null }
    | null

  const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
  const logo = logoUrl ? await urlNaarBase64(logoUrl).catch(() => null) : null

  const pdfBytes = bouwWerktijdenPdf({
    naam,
    periode,
    rijen: gegevens.rijen,
    handmatigAantal: gegevens.handmatigAantal,
    bedrijfsnaam: bedrijf?.naam ?? null,
    logo,
  })

  return new NextResponse(pdfBytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${werktijdenPdfBestandsnaam(naam, periode)}"`,
    },
  })
}
