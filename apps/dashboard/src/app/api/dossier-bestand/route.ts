import { NextRequest, NextResponse } from 'next/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bronUitQuery, haalBestandBytes, BestandFoutError } from '@/lib/dossiers/bestand-bytes'

export const dynamic = 'force-dynamic'

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
  try {
    // Object-level authz: bestanden horen bij dossiers, dus lees-recht op die module
    // is de ondergrens. Zonder deze check kan elke ingelogde gebruiker willekeurige
    // project- of SharePoint-bestanden ophalen.
    await vereisRecht('dossiers', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const params = req.nextUrl.searchParams
  const bron = bronUitQuery(params)
  if (!bron) return new NextResponse('Geen geldig bestand opgegeven', { status: 400 })

  let bestand
  try {
    bestand = await haalBestandBytes(bron)
  } catch (e) {
    if (e instanceof BestandFoutError) return new NextResponse(e.message, { status: e.status })
    return new NextResponse('Ophalen mislukt', { status: 502 })
  }

  const naam = (params.get('naam') || bestand.fileName || 'bestand').replace(/["\r\n]/g, '')
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
