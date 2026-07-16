/**
 * POST /api/documenten/docx
 *
 * Geeft het ingevulde Word-document terug, zodat de gebruiker er handmatig nog
 * iets aan kan veranderen vóór verzending.
 *
 * Bewust GEEN archivering/registratie: dit is een werkbestand, geen eindproduct.
 * De PDF-route is het pad dat wél in het dossier landt.
 *
 * Body: { sjabloon_id, dossier_id, invoer }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError, getCurrentMedewerker } from '@/lib/auth/rechten'
import {
  genereerDocumentDocx,
  laadSjabloon,
  bestandsnaamVoor,
  assertInvoerCompleet,
  GeenTemplateError,
  DocumentInvoerError,
  DEMO_DOSSIER,
} from '@/lib/documenten/genereer-document'

export const dynamic = 'force-dynamic'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function POST(request: NextRequest) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  let body: { sjabloon_id?: string; dossier_id?: string; invoer?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }

  const { sjabloon_id: sjabloonId, dossier_id: dossierId, invoer = {} } = body
  if (!sjabloonId || !dossierId) {
    return NextResponse.json({ error: 'sjabloon_id en dossier_id zijn verplicht' }, { status: 400 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const sjabloon = await laadSjabloon(supabase, sjabloonId)
    if (!sjabloon) return NextResponse.json({ error: 'Sjabloon niet gevonden' }, { status: 404 })

    assertInvoerCompleet(sjabloon, invoer)

    const medewerker = await getCurrentMedewerker()
    const docx = await genereerDocumentDocx(supabase, sjabloon, dossierId, invoer, medewerker?.id)

    let dossiernummer: string | null = null
    if (dossierId !== DEMO_DOSSIER) {
      const { data } = await supabase.from('dossiers').select('dossiernummer').eq('id', dossierId).maybeSingle()
      dossiernummer = data?.dossiernummer ?? null
    }
    const naam = bestandsnaamVoor(sjabloon, dossiernummer)

    return new NextResponse(docx.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(naam)}.docx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof DocumentInvoerError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof GeenTemplateError) {
      return NextResponse.json({ error: 'Koppel eerst een Word-template aan dit sjabloon.' }, { status: 422 })
    }
    console.error('Document docx fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis bij het opstellen van het document' }, { status: 500 })
  }
}
