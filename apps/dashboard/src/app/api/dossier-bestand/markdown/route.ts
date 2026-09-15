import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bronUitQuery, haalBestandBytes, BestandFoutError } from '@/lib/dossiers/bestand-bytes'
import { leesMarkdown, MAX_MARKDOWN_BYTES } from '@/lib/dossiers/markdown-lezen'

export const dynamic = 'force-dynamic'
// De opmaak wordt server-side gedaan; dat is Node-werk.
export const runtime = 'nodejs'

/**
 * GET /api/dossier-bestand/markdown?bron=… → het `.md`-bestand als opgemaakte HTML
 *
 * Zo is een markdown-document in het dossier direct te lezen, in plaats van het te
 * moeten downloaden en in een teksteditor te openen.
 */
export async function GET(req: NextRequest) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ fout: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const bron = bronUitQuery(req.nextUrl.searchParams)
  if (!bron) return NextResponse.json({ fout: 'Geen geldig bestand opgegeven' }, { status: 400 })

  let bestand
  try {
    bestand = await haalBestandBytes(bron)
  } catch (e) {
    const melding = e instanceof BestandFoutError ? e.message : 'Ophalen mislukt'
    const status = e instanceof BestandFoutError ? e.status : 502
    return NextResponse.json({ fout: melding }, { status })
  }

  if (bestand.data.length > MAX_MARKDOWN_BYTES) {
    return NextResponse.json(
      { fout: 'Dit bestand is te groot om hier te tonen.' },
      { status: 413 },
    )
  }

  try {
    return NextResponse.json(leesMarkdown(bestand.data), {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (e) {
    // Geen 500: de gebruiker moet gewoon de downloadknop te zien krijgen.
    return NextResponse.json(
      { fout: `Dit bestand kon niet gelezen worden: ${e instanceof Error ? e.message : 'onbekende fout'}` },
      { status: 422 },
    )
  }
}
