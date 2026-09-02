import { NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bouwInzendingPdf } from '@/lib/formulieren/inzending-pdf'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  // Object-level authz: de PDF wordt met de admin-client (bypast RLS) opgebouwd — vereis
  // lees-recht op de formulieren-module zodat niet elke ingelogde gebruiker een inzending kan ophalen.
  try {
    await vereisRecht('formulieren', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const { subId } = await params

  // De opbouw zelf staat in lib/formulieren/inzending-pdf.ts, zodat het
  // klantportaal dezelfde PDF kan uitleveren achter zijn eigen poort.
  const pdf = await bouwInzendingPdf(subId)
  if (!pdf) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  return new NextResponse(pdf.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.bestandsnaam}"`,
    },
  })
}
