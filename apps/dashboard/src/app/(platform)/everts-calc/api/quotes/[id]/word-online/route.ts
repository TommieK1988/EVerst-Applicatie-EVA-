/**
 * POST /everts-calc/api/quotes/[id]/word-online
 *
 * Zet het bewerkbare Word-document van de offerte klaar in de SharePoint-
 * dossiermap en geeft de webUrl terug zodat de browser het in Word Online opent.
 *
 * Waarom uploaden en niet downloaden: Word Online kan alleen een bestand openen
 * dat in SharePoint/OneDrive staat. Dat is meteen de winst — het bestand blijft
 * aan het dossier én aan de offerte hangen, dus goedkeuring aanvragen en mailen
 * naar de klant blijven vanuit EVA werken.
 *
 * Body: { opnieuw?: boolean }  — true stelt het document opnieuw op uit het
 *        layout-sjabloon en overschrijft handmatige bewerkingen.
 * Antwoord: { webUrl, bestandsnaam, hergebruikt }
 */

import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import {
  maakOfferteWordDocument,
  GeenDossierMapError,
} from '@/lib/everts-calc/offerte-word'
import { GeenTemplateError } from '@/lib/everts-calc/render-quote-docx'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  // Muterend (schrijft naar SharePoint én naar quotes) → schrijfrecht vereist.
  let medewerkerId: string | null = null
  try {
    const { medewerker } = await vereisRecht('everts_calc', 'schrijven')
    medewerkerId = medewerker.id
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  let opnieuw = false
  try {
    const body = await request.json()
    opnieuw = body?.opnieuw === true
  } catch {
    /* lege body = gewoon openen */
  }

  try {
    const res = await maakOfferteWordDocument(id, { opnieuw, medewerkerId })
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof GeenTemplateError) {
      return NextResponse.json(
        { error: 'Koppel eerst een Word-template aan deze offerte-layout.' },
        { status: 422 },
      )
    }
    if (err instanceof GeenDossierMapError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    console.error('Offerte Word Online fout:', err)
    return NextResponse.json(
      { error: 'Er ging iets mis bij het klaarzetten van het Word-document' },
      { status: 500 },
    )
  }
}
