import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { runParkingImport } from '@/lib/parking-import-core'

/**
 * POST /api/email/parking
 *
 * Ontvangt de ULU parkeer-Excel als e-mail bijlage (via Resend inbound webhook).
 * ULU stuurt het rapport naar wagenpark@<jouw-domein>.
 * Resend stuurt de e-mail als JSON webhook naar dit endpoint.
 *
 * Resend inbound webhook formaat:
 *   { from, to, subject, attachments: [{ filename, content (base64), type }] }
 *
 * Beveiliging: zet het webhook-endpoint in Resend als:
 *   https://<app-url>/api/email/parking?secret=<PARKING_EMAIL_SECRET>
 */

type ResendAttachment = {
  filename?: string
  content: string  // base64
  type?: string
}

type ResendInboundPayload = {
  from?: string
  to?: string[]
  subject?: string
  attachments?: ResendAttachment[]
}

export async function POST(req: NextRequest) {
  const secret = process.env.PARKING_EMAIL_SECRET
  if (secret) {
    const urlSecret = req.nextUrl.searchParams.get('secret')
    const authHeader = req.headers.get('authorization')
    const validUrl = urlSecret === secret
    const validHeader = authHeader === `Bearer ${secret}`
    if (!validUrl && !validHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: ResendInboundPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON body.' }, { status: 400 })
  }

  const xlsxAttachment = body.attachments?.find(
    (a) =>
      a.filename?.toLowerCase().endsWith('.xlsx') ||
      a.type?.includes('spreadsheetml') ||
      a.type?.includes('excel'),
  )

  if (!xlsxAttachment) {
    console.warn('[email/parking] Geen Excel-bijlage gevonden in e-mail van:', body.from)
    return NextResponse.json(
      { error: 'Geen Excel-bijlage (.xlsx) gevonden in de e-mail.' },
      { status: 400 },
    )
  }

  let buf: Buffer
  try {
    buf = Buffer.from(xlsxAttachment.content, 'base64')
  } catch {
    return NextResponse.json({ error: 'Bijlage kon niet worden gedecodeerd.' }, { status: 400 })
  }

  try {
    const bestandsnaam = xlsxAttachment.filename ?? `parking-email-${Date.now()}.xlsx`
    const result = await runParkingImport(buf, bestandsnaam)

    if (result.ok) {
      console.log(
        `[email/parking] Import geslaagd: ${result.parkingVerwerkt} rijen verwerkt`,
        `(bron: ${body.from}, bestand: ${bestandsnaam})`,
      )
      revalidatePath('/ritten')
      revalidatePath('/dashboard')
    } else {
      console.error('[email/parking] Import mislukt:', result.error)
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err) {
    console.error('[email/parking] Onverwachte fout:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
