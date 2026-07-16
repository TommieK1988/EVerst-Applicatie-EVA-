/**
 * POST /api/documenten/pdf
 *
 * Genereert de definitieve PDF van een document, archiveert hem (optioneel) in de
 * SharePoint-dossiermap en registreert hem in `dossier_documenten`.
 *
 * Body: { sjabloon_id, dossier_id, invoer, archiveren? }
 *
 * POST (geen GET) omdat de invoer een willekeurig groot object is en dit een
 * registrerende actie is — geen cachebare read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError, getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import {
  genereerDocumentPdf,
  laadSjabloon,
  bestandsnaamVoor,
  assertInvoerCompleet,
  GeenTemplateError,
  DocumentInvoerError,
} from '@/lib/documenten/genereer-document'
import { archiveerEnRegistreer } from '@/lib/documenten/archiveer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  let body: { sjabloon_id?: string; dossier_id?: string; invoer?: Record<string, unknown>; archiveren?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }

  const { sjabloon_id: sjabloonId, dossier_id: dossierId, invoer = {}, archiveren = true } = body
  if (!sjabloonId || !dossierId) {
    return NextResponse.json({ error: 'sjabloon_id en dossier_id zijn verplicht' }, { status: 400 })
  }

  try {
    // Afgesloten dossier → niets meer aan toevoegen.
    await assertDossierBewerkbaar(dossierId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const sjabloon = await laadSjabloon(supabase, sjabloonId)
    if (!sjabloon) return NextResponse.json({ error: 'Sjabloon niet gevonden' }, { status: 404 })

    assertInvoerCompleet(sjabloon, invoer)

    const medewerker = await getCurrentMedewerker()
    const pdf = await genereerDocumentPdf(supabase, sjabloon, dossierId, invoer, medewerker?.id)

    const { data: dossier } = await supabase
      .from('dossiers').select('dossiernummer').eq('id', dossierId).maybeSingle()
    const naam = bestandsnaamVoor(sjabloon, dossier?.dossiernummer)

    // Archiveren + registreren is best-effort: de download mag er nooit op stuklopen.
    const archief = await archiveerEnRegistreer({
      supabase,
      dossierId,
      sjabloon,
      invoer,
      bestandsnaam: `${naam}.pdf`,
      bytes: pdf,
      medewerkerId: medewerker?.id ?? null,
      archiveren,
    })

    return new NextResponse(pdf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(naam)}.pdf"`,
        'Cache-Control': 'no-store',
        // De client toont hiermee "gearchiveerd" of juist de reden waarom niet.
        'X-Archief-Status': archief.ok ? 'ok' : 'mislukt',
      },
    })
  } catch (err) {
    if (err instanceof GeenToegangError) return NextResponse.json({ error: 'Dossier is afgesloten' }, { status: 403 })
    if (err instanceof DocumentInvoerError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof GeenTemplateError) {
      return NextResponse.json({ error: 'Koppel eerst een Word-template aan dit sjabloon.' }, { status: 422 })
    }
    // M3: renderdetails niet naar de client lekken op een downloadroute.
    console.error('Document PDF fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis bij het opstellen van het document' }, { status: 500 })
  }
}
