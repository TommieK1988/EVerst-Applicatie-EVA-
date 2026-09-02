import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisPortaalOnderdeel } from '@/lib/portaal/auth'
import { bouwInzendingPdf } from '@/lib/formulieren/inzending-pdf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portaal/formulier-pdf?dossier=…&inzending=…
 *
 * De PDF van een ingevuld formulier, voor de klant. Dezelfde opbouw als de
 * medewerkersroute (gedeelde code in lib/formulieren/inzending-pdf.ts), maar
 * met drie extra controles ervoor — een inzending-id uit de URL zegt niets:
 *
 *  1. hoort dit dossier bij deze bezoeker en staat het onderdeel aan;
 *  2. hoort de inzending bij dát dossier (en niet bij een ander project);
 *  3. is het sjabloon vrijgegeven en is de inzending daadwerkelijk ingediend.
 *
 * Zonder 2 en 3 zou elke portaalgebruiker met een geldig eigen dossier iedere
 * inzending in het systeem kunnen ophalen.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const dossierId = params.get('dossier') ?? ''
  const inzendingId = params.get('inzending') ?? ''
  if (!dossierId || !inzendingId) return new NextResponse('Onvolledig verzoek', { status: 400 })

  try {
    await vereisPortaalOnderdeel(dossierId, 'formulieren')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: inzending } = await db
    .from('form_inzendingen')
    .select('id, template_id, status')
    .eq('id', inzendingId)
    .eq('dossier_id', dossierId)
    .in('status', ['ingediend', 'goedgekeurd'])
    .maybeSingle()
  if (!inzending) return new NextResponse('Geen toegang', { status: 403 })

  const { data: sjabloon } = await db
    .from('form_templates')
    .select('id')
    .eq('id', inzending.template_id)
    .eq('portaal_zichtbaar', true)
    .maybeSingle()
  if (!sjabloon) return new NextResponse('Geen toegang', { status: 403 })

  const pdf = await bouwInzendingPdf(inzendingId)
  if (!pdf) return new NextResponse('Niet gevonden', { status: 404 })

  return new NextResponse(pdf.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.bestandsnaam}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
