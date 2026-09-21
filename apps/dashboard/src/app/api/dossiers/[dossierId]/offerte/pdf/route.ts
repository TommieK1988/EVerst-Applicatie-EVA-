import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { kiesOfferteBron } from '@/lib/dossiers/offerte-bron'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/dossiers/<dossierId>/offerte/pdf
 *
 * De offerte van een dossier als PDF, ongeacht waar hij vandaan komt (EVA-offerte, handmatig
 * gekoppelde PDF of Bouw7-projectbestand — zie `lib/dossiers/offerte-bron.ts`).
 *
 * Staat onder `/api/` en niet naast de bestaande `/everts-calc/api/quotes/[id]/pdf-preview`:
 * de middleware stuurt een telefoon op élke niet-`/api/`-route door naar `/m`, dus vanaf de
 * mobiele app is die route onbereikbaar. Dit is de ingang die wél werkt.
 *
 * Object-level authz: de bron wordt met de admin-client opgezocht (bypast RLS), dus zonder deze
 * check kan elke ingelogde gebruiker de offerte van een willekeurig dossier ophalen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const { dossierId } = await params
  const bron = await kiesOfferteBron(dossierId)
  if (!bron) return new NextResponse('Geen offerte gevonden bij dit dossier', { status: 404 })

  if (bron.soort === 'bouw7') {
    // Het Bouw7-bestand heeft de Bearer-token nodig; die proxy bestaat al. Doorsturen in plaats
    // van de bytes hier nog eens doorpompen.
    const hash = bron.fileHash ? encodeURIComponent(bron.fileHash) : '-'
    const qs = new URLSearchParams({ naam: bron.naam })
    if (bron.bestandId != null) qs.set('id', String(bron.bestandId))
    return NextResponse.redirect(new URL(`/api/bouw7/bestand/${hash}?${qs}`, _req.url))
  }

  if (bron.soort === 'gekoppeld') {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from('dossier-offertes').download(bron.pad)
    if (error || !data) return new NextResponse('Offerte-PDF kon niet worden opgehaald', { status: 502 })
    return pdfAntwoord(Buffer.from(await data.arrayBuffer()), bron.naam)
  }

  // EVA-offerte: live renderen, inclusief briefpapier. Daarachter de eigen bijlages en dan de
  // algemene voorwaarden, en zolang de offerte niet is goedgekeurd krijgt hij het CONCEPT-stempel
  // — dezelfde regels als de download op de desktop, zodat er geen schone PDF van een
  // ongoedgekeurde offerte rondgaat.
  try {
    const { genereerOffertePdfMetBijlagen } = await import('@/lib/everts-calc/genereer-offerte-pdf')
    const { tekenConceptWatermerk } = await import('@/lib/everts-calc/briefpapier')
    const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')

    const { offertePdf, voorwaardenPdf, quoteNummer } = await genereerOffertePdfMetBijlagen(bron.quoteId)

    // `offertePdf` bevat de eigen bijlages al; hier komen alleen de voorwaarden nog achteraan.
    const { voegPdfsSamen } = await import('@/lib/everts-calc/pdf-bijlagen')
    let pdf: Uint8Array = await voegPdfsSamen(offertePdf, [voorwaardenPdf])

    // Bij twijfel stempelen: een schone PDF van een ongoedgekeurde offerte is de verkeerde fout.
    const verzendbaar = await assertOfferteVerzendbaar(bron.quoteId).then(r => r.ok).catch(() => false)
    if (!verzendbaar) pdf = await tekenConceptWatermerk(pdf)

    return pdfAntwoord(Buffer.from(pdf), `${quoteNummer ?? 'Offerte'}.pdf`)
  } catch (err) {
    // Foutdetails niet naar de client lekken — alleen server-side loggen.
    console.error('Offerte-PDF genereren mislukt:', err)
    return new NextResponse('De offerte kon niet worden opgebouwd', { status: 500 })
  }
}

function pdfAntwoord(bytes: Buffer, naam: string): NextResponse {
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(naam.replace(/["\r\n]/g, ''))}"`,
      'Cache-Control': 'no-store',
    },
  })
}
