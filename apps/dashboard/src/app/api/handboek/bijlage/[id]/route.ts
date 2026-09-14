import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { HANDBOEK_BUCKET } from '@/lib/handboek/bijlagen'

export const dynamic = 'force-dynamic'

/**
 * GET /api/handboek/bijlage/{id} — levert één handboek-bijlage uit (PDF).
 *
 * Bewust een proxy en géén signed URL. Een signed URL is een uur lang een
 * bearer-token: wie hem heeft mag erbij, ook een flexkracht aan wie een
 * collega het linkje doorstuurt. En juist bij dit bestand is dat het verschil —
 * het verzuimprotocol en de autoregeling zijn niet voor iedereen bedoeld. Deze
 * route toetst bij élke aanvraag opnieuw.
 *
 * De autorisatie zit in de leesquery zelf: we halen de bijlage op met de
 * SESSIE-client, dus de RLS-policy beslist of deze lezer hem mag hebben.
 * Bestaat de rij niet of mag hij niet — hetzelfde antwoord, want anders vertelt
 * een 403 dat er een bijlage bestaat die je niet mag zien.
 *
 * De storage-sleutel wordt pas ná die controle gelezen en bereikt de browser
 * nooit.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  try {
    await vereisHandboekLezer()
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const supabase = await createClient()
  const { data: bijlage } = await supabase
    .from('personeelshandboek_bijlagen')
    .select('storage_path, bestandsnaam, mimetype')
    .eq('id', id)
    .maybeSingle()

  if (!bijlage) return new NextResponse('Bijlage niet gevonden', { status: 404 })

  const { data, error } = await createAdminClient()
    .storage.from(HANDBOEK_BUCKET)
    .download(bijlage.storage_path)

  // Wél een rij maar geen bestand: de bijlage is aangemaakt maar het uploaden
  // is nooit gebeurd. Dat is een beheerfout, geen toegangsfout.
  if (error || !data) return new NextResponse('Bestand is nog niet geüpload', { status: 404 })

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      'Content-Type': bijlage.mimetype || data.type || 'application/octet-stream',
      // `inline` zodat de telefoon hem in de PDF-viewer opent in plaats van te
      // downloaden; de bestandsnaam is wat je ziet als je hem tóch bewaart.
      'Content-Disposition': `inline; filename="${bijlage.bestandsnaam.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
