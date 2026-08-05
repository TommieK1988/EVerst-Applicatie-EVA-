import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bronUitQuery, haalBestandBytes, BestandFoutError } from '@/lib/dossiers/bestand-bytes'
import { leesMsg, leesMsgBijlage } from '@/lib/dossiers/msg-lezen'

export const dynamic = 'force-dynamic'
// De msg-parser leest de hele OLE-container in het geheugen; dat is Node-werk.
export const runtime = 'nodejs'

/**
 * GET /api/dossier-bestand/mail?bron=…            → het uitgelezen bericht als JSON
 * GET /api/dossier-bestand/mail?bron=…&bijlage=2  → die bijlage als download
 *
 * Zo is een Outlook-mail in het dossier direct te lezen, zonder hem eerst te
 * downloaden en in Outlook te openen.
 */
export async function GET(req: NextRequest) {
  try {
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ fout: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const params = req.nextUrl.searchParams
  const bron = bronUitQuery(params)
  if (!bron) return NextResponse.json({ fout: 'Geen geldig bestand opgegeven' }, { status: 400 })

  let bestand
  try {
    bestand = await haalBestandBytes(bron)
  } catch (e) {
    const melding = e instanceof BestandFoutError ? e.message : 'Ophalen mislukt'
    const status = e instanceof BestandFoutError ? e.status : 502
    return NextResponse.json({ fout: melding }, { status })
  }

  const bijlageParam = params.get('bijlage')
  if (bijlageParam != null) {
    const index = Number(bijlageParam)
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ fout: 'Ongeldige bijlage' }, { status: 400 })
    }
    let bijlage
    try {
      bijlage = leesMsgBijlage(bestand.data, index)
    } catch {
      return NextResponse.json({ fout: 'Deze mail kon niet gelezen worden.' }, { status: 422 })
    }
    if (!bijlage) return NextResponse.json({ fout: 'Bijlage niet gevonden' }, { status: 404 })

    const naam = bijlage.naam.replace(/["\r\n]/g, '')
    return new NextResponse(new Uint8Array(bijlage.data), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${naam}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  try {
    return NextResponse.json(leesMsg(bestand.data), {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (e) {
    // Beschadigd of een formaat dat we niet aankunnen (bv. een hernoemde .eml).
    // Geen 500: de gebruiker moet gewoon de downloadknop te zien krijgen.
    return NextResponse.json(
      { fout: `Deze mail kon niet gelezen worden: ${e instanceof Error ? e.message : 'onbekende fout'}` },
      { status: 422 },
    )
  }
}
