import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

const BUCKET = 'portaal-bijlagen'

/**
 * GET /api/portaal/bijlage-intern?dossier=…&pad=…
 *
 * Dezelfde bijlage als /api/portaal/bijlage, maar voor een medewerker in EVA.
 *
 * Bewust een aparte route en niet een extra tak in de klantroute: die twee
 * hebben totaal verschillende poorten (een portaalsessie tegenover een
 * modulerecht), en een gedeelde route met een `intern=1`-vlag is precies de
 * vorm waarin zulke checks ooit door elkaar gaan lopen.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const dossierId = params.get('dossier') ?? ''
  const pad = params.get('pad') ?? ''
  if (!dossierId || !pad) return new NextResponse('Onvolledig verzoek', { status: 400 })

  // Ook hier: het pad moet in de map van dit dossier liggen. Anders is `pad` een
  // vrije greep in de bijlagen van elke andere klant.
  if (!pad.startsWith(`${dossierId}/`) || pad.includes('..')) {
    return new NextResponse('Geen toegang', { status: 403 })
  }

  try {
    await vereisRecht('klantportaal', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const { data, error } = await createAdminClient().storage.from(BUCKET).download(pad)
  if (error || !data) return new NextResponse('Bijlage niet gevonden', { status: 404 })

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
