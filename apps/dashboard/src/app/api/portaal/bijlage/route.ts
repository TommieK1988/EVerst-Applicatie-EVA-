import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisPortaalOnderdeel } from '@/lib/portaal/auth'

export const dynamic = 'force-dynamic'

const BUCKET = 'portaal-bijlagen'

/**
 * GET /api/portaal/bijlage?dossier=…&pad=…
 *
 * Levert een chatbijlage uit. De bucket is privé — anders dan oplever-fotos en
 * kwaliteit-fotos, die publiek zijn — want dit is correspondentie tussen ons en
 * één opdrachtgever en hoort niet op een raadbare URL te staan.
 *
 * Twee controles die allebei nodig zijn:
 *  1. hoort dit dossier bij deze bezoeker, en staat de chat aan;
 *  2. ligt het gevraagde pad binnen de map van dát dossier. Zonder die tweede
 *     controle is `pad` een vrije greep in de hele bucket, dus in de bijlagen
 *     van elke andere klant.
 *
 * Ook medewerkers lopen hier niet langs: die lezen bijlagen via het chatblok in
 * het dossier, dat de admin-client achter `vereisRecht` gebruikt.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const dossierId = params.get('dossier') ?? ''
  const pad = params.get('pad') ?? ''

  if (!dossierId || !pad) return new NextResponse('Onvolledig verzoek', { status: 400 })

  // Het pad moet in de map van dit dossier liggen. '..' kan er dan niet meer
  // tussen zitten, maar we weren het expliciet — een storage-backend die dat
  // ooit anders normaliseert mag geen gat openen.
  if (!pad.startsWith(`${dossierId}/`) || pad.includes('..')) {
    return new NextResponse('Geen toegang', { status: 403 })
  }

  try {
    await vereisPortaalOnderdeel(dossierId, 'chat')
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
