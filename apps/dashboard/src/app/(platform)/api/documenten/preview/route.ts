/**
 * GET /api/documenten/preview
 *
 * Inline PDF-preview van een document. Gebruikt door de genereermodal (echt dossier)
 * en door de sjabloon-editor (dossier_id=demo → testgegevens).
 *
 * Query:
 *   sjabloon_id   verplicht
 *   dossier_id    verplicht ('demo' = testgegevens, geen DB-lookup)
 *   invoer        JSON-object met de ingevulde velden (optioneel)
 *   template_url / drive_id / item_id / briefpapier_url
 *                 optionele overrides, zodat de editor een net geüpload template kan
 *                 tonen vóór het is opgeslagen.
 *
 * Authz: dossiers-leesrecht. Bewust WEL een check — de offerte-tegenhanger
 * (/everts-calc/api/quotes/[id]/pdf-preview) heeft er geen en dat gat kopiëren we niet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError, getCurrentMedewerker } from '@/lib/auth/rechten'
import {
  genereerDocumentPdf,
  laadSjabloon,
  GeenTemplateError,
  DEMO_DOSSIER,
} from '@/lib/documenten/genereer-document'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const q = request.nextUrl.searchParams
  const sjabloonId = q.get('sjabloon_id')
  const dossierId = q.get('dossier_id') ?? DEMO_DOSSIER
  if (!sjabloonId) return NextResponse.json({ error: 'sjabloon_id ontbreekt' }, { status: 400 })

  let invoer: Record<string, unknown> = {}
  try {
    const ruw = q.get('invoer')
    if (ruw) invoer = JSON.parse(ruw)
  } catch {
    /* ongeldige invoer-JSON → lege invoer, preview toont de standaardwaarden */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const sjabloon = await laadSjabloon(supabase, sjabloonId)
    if (!sjabloon) return NextResponse.json({ error: 'Sjabloon niet gevonden' }, { status: 404 })

    const medewerker = await getCurrentMedewerker()

    const templateUrl = q.get('template_url')
    const driveId = q.get('drive_id')
    const itemId = q.get('item_id')
    const briefpapierUrl = q.get('briefpapier_url')

    const pdf = await genereerDocumentPdf(supabase, sjabloon, dossierId, invoer, medewerker?.id, {
      templateOverride: templateUrl || itemId
        ? {
            docx_template_url: templateUrl,
            docx_template_bron: itemId ? 'sharepoint' : 'bucket',
            docx_template_drive_id: driveId,
            docx_template_item_id: itemId,
          }
        : null,
      briefpapierOverride: briefpapierUrl,
    })

    return new NextResponse(pdf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="preview.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof GeenTemplateError) {
      return NextResponse.json({ error: 'Koppel eerst een Word-template aan dit sjabloon.' }, { status: 422 })
    }
    // De preview is het beheerscherm van de eigen template: hier is de renderfout
    // (met tag + omringende tekst) juist de hele waarde. Downloadroutes blijven generiek.
    console.error('Document preview fout:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Er ging iets mis' }, { status: 500 })
  }
}
