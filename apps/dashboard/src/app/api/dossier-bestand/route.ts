import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { vereisPortaalOnderdeel, logPortaalToegang } from '@/lib/portaal/auth'
import { bronUitQuery, haalBestandBytes, BestandFoutError, type BestandBron } from '@/lib/dossiers/bestand-bytes'

export const dynamic = 'force-dynamic'

/**
 * Bepaalt de bron voor een klantverzoek uit het klantportaal.
 *
 * Het verschil met de medewerkerstak is de kern van de beveiliging: hier worden
 * `bron`, `hash`, `id`, `driveId`, `itemId` en `naam` uit de querystring
 * VOLLEDIG GENEGEERD. De klant stuurt alleen een dossier en een sleutel mee; wat
 * daarachter zit, komt uit portaal_bestanden — de tabel waarin een collega het
 * bestand expliciet heeft vrijgegeven. Zo kan een geknutselde URL nooit een
 * ander bestand aanwijzen dan wat er is gedeeld.
 *
 * Levert null als er niets is vrijgegeven onder die sleutel; de aanroeper maakt
 * daar een 403 van (geen 404 — dat zou verklappen of een sleutel bestaat).
 */
async function portaalBron(
  dossierId: string,
  sleutel: string,
  ip: string | null,
): Promise<{ bron: BestandBron; naam: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('portaal_bestanden')
    .select('bron_query, naam, soort')
    .eq('dossier_id', dossierId)
    .eq('sleutel', sleutel)
    .eq('zichtbaar', true)
    .maybeSingle()
  if (!data) return null

  // Staat het onderdeel uit, dan bestaat ook een eerder gedeeld bestand niet meer.
  const { gebruiker } = await vereisPortaalOnderdeel(
    dossierId, data.soort === 'afbeelding' ? 'fotos' : 'bestanden',
  )

  const bron = bronUitQuery(new URLSearchParams(String(data.bron_query)))
  if (!bron) return null

  // Vastleggen wie welk bestand ophaalde. Dit is het enige moment waarop er
  // daadwerkelijk inhoud het pand verlaat; een AVG-inzagevraag gaat hierover.
  await logPortaalToegang({
    portaalGebruikerId: gebruiker.id,
    dossierId,
    onderdeel: data.soort === 'afbeelding' ? 'fotos' : 'bestanden',
    sleutel,
    ip,
  })

  return { bron, naam: (data.naam as string | null) || 'bestand' }
}

/**
 * GET /api/dossier-bestand?bron=bouw7&hash=…&id=…
 * GET /api/dossier-bestand?bron=sharepoint&driveId=…&itemId=…
 *
 * Uitleverpunt voor de samengevoegde bestandenlijst: Bouw7 en SharePoint vragen
 * allebei om een servertoken, dus het bestand kan geen kale link zijn. EVA haalt het
 * op en streamt het terug.
 *
 * Extra parameters:
 * - `naam`   weergavenaam in de Content-Disposition
 * - `w`      maximale breedte in pixels — verkleint afbeeldingen voor de fotogalerij,
 *            zodat een galerij van dertig telefoonfoto's geen dertig megabytes kost
 * - `download=1` forceert opslaan i.p.v. openen in het tabblad
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const isPortaal = params.get('portaal') === '1'

  let bron: BestandBron | null
  let vasteNaam: string | null = null

  if (isPortaal) {
    const dossierId = params.get('dossier') ?? ''
    const sleutel = params.get('sleutel') ?? ''
    if (!dossierId || !sleutel) return new NextResponse('Geen geldig bestand opgegeven', { status: 400 })
    try {
      // Vercel zet het echte adres in x-forwarded-for; de eerste is de bezoeker.
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
      const gevonden = await portaalBron(dossierId, sleutel, ip)
      if (!gevonden) return new NextResponse('Geen toegang', { status: 403 })
      bron = gevonden.bron
      vasteNaam = gevonden.naam
    } catch (e) {
      if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
      throw e
    }
  } else {
    try {
      // Object-level authz: bestanden horen bij dossiers, dus lees-recht op die module
      // is de ondergrens. Zonder deze check kan elke ingelogde gebruiker willekeurige
      // project- of SharePoint-bestanden ophalen.
      await vereisRecht('dossiers', 'lezen')
    } catch (e) {
      if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
      throw e
    }
    bron = bronUitQuery(params)
  }

  if (!bron) return new NextResponse('Geen geldig bestand opgegeven', { status: 400 })

  let bestand
  try {
    bestand = await haalBestandBytes(bron)
  } catch (e) {
    if (e instanceof BestandFoutError) return new NextResponse(e.message, { status: e.status })
    return new NextResponse('Ophalen mislukt', { status: 502 })
  }

  // In de portaaltak komt de naam uit de database, niet uit het verzoek — anders
  // bepaalt de bezoeker zelf onder welke bestandsnaam iets wordt opgeslagen.
  const naam = (vasteNaam ?? params.get('naam') ?? bestand.fileName ?? 'bestand').replace(/["\r\n]/g, '')
  const dispositie = params.get('download') === '1' ? 'attachment' : 'inline'

  let data = bestand.data
  let contentType = bestand.contentType || 'application/octet-stream'

  const breedte = Number(params.get('w'))
  if (Number.isFinite(breedte) && breedte > 0 && breedte <= 2400) {
    const verkleind = await verkleinAfbeelding(data, Math.round(breedte))
    if (verkleind) {
      data = verkleind
      contentType = 'image/jpeg'
    }
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${dispositie}; filename="${naam}"`,
      // Privé: het antwoord is rechten-afhankelijk en mag niet op een gedeelde CDN
      // belanden. Thumbnails mogen langer blijven hangen dan het origineel.
      'Cache-Control': breedte ? 'private, max-age=3600' : 'private, max-age=60',
    },
  })
}

/**
 * Verkleint tot een JPEG-thumbnail. `rotate()` respecteert de EXIF-oriëntatie —
 * zonder dat staan telefoonfoto's op hun kant. Geeft null terug als het geen
 * (leesbare) afbeelding is, zodat de route het origineel doorgeeft.
 */
async function verkleinAfbeelding(buf: Buffer, breedte: number): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default
    return await sharp(buf)
      .rotate()
      .resize({ width: breedte, height: breedte, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer()
  } catch {
    return null
  }
}
