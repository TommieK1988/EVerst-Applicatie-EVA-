/**
 * POST /api/documenten/word-online
 *
 * Stelt het document op, zet het in de SharePoint-dossiermap en geeft de webUrl
 * terug zodat de browser het in Word Online kan openen.
 *
 * Waarom uploaden en niet downloaden: Word Online kan alleen een bestand openen
 * dat in SharePoint/OneDrive staat. "Bewerken in Word Online" impliceert dus
 * archiveren — er is geen variant die alleen in de browser bewerkt.
 *
 * Body: { sjabloon_id, dossier_id, invoer }
 * Antwoord: { webUrl, documentId, bestandsnaam }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError, getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import {
  genereerDocumentDocx,
  laadSjabloon,
  bestandsnaamVoor,
  assertInvoerCompleet,
  GeenTemplateError,
  DocumentInvoerError,
} from '@/lib/documenten/genereer-document'
import { archiveerEnRegistreer } from '@/lib/documenten/archiveer'

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
    await assertDossierBewerkbaar(dossierId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const sjabloon = await laadSjabloon(supabase, sjabloonId)
    if (!sjabloon) return NextResponse.json({ error: 'Sjabloon niet gevonden' }, { status: 404 })

    assertInvoerCompleet(sjabloon, invoer)

    const medewerker = await getCurrentMedewerker()
    const docx = await genereerDocumentDocx(supabase, sjabloon, dossierId, invoer, medewerker?.id)

    const { data: dossier } = await supabase
      .from('dossiers').select('dossiernummer').eq('id', dossierId).maybeSingle()
    const bestandsnaam = `${bestandsnaamVoor(sjabloon, dossier?.dossiernummer)}.docx`

    const archief = await archiveerEnRegistreer({
      supabase, dossierId, sjabloon, invoer,
      bestandsnaam, bytes: docx, contentType: DOCX_MIME,
      medewerkerId: medewerker?.id ?? null,
      // Archiveren is hier geen keuze maar de voorwaarde: zonder bestand in
      // SharePoint valt er niets in Word Online te openen.
      archiveren: true,
    })

    if (!archief.webUrl) {
      // Meest voorkomende oorzaak: O365_DOSSIER_DRIVE_ID ontbreekt of de
      // dossiermap kon niet worden gemaakt. Geef de reden door — de gebruiker
      // kan dan de PDF-knop gebruiken of de map koppelen.
      return NextResponse.json(
        { error: archief.fout ?? 'Kon het document niet in SharePoint plaatsen; bewerken in Word Online kan daardoor niet.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      webUrl: archief.webUrl,
      documentId: archief.documentId,
      bestandsnaam,
    })
  } catch (err) {
    if (err instanceof GeenToegangError) return NextResponse.json({ error: 'Dossier is afgesloten' }, { status: 403 })
    if (err instanceof DocumentInvoerError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof GeenTemplateError) {
      return NextResponse.json({ error: 'Koppel eerst een Word-template aan dit sjabloon.' }, { status: 422 })
    }
    console.error('Word Online fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis bij het opstellen van het document' }, { status: 500 })
  }
}
