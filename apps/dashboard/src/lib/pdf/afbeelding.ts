import 'server-only'
import { haalOp } from '@/lib/net/deadline'

/**
 * Foto's klaarmaken voor de met pdf-lib getekende rapportages (opleverrapport, opnamedocument).
 *
 * pdf-lib sluit afbeeldingsbytes ongewijzigd in, dus zonder verkleinen levert één telefoonfoto al
 * megabytes op en overschrijdt een mailbijlage de limiet van Graph sendMail (~4 MB per bericht).
 */

/** Ruimhartig: de bron mag groot zijn, we verkleinen hem hierna zelf. */
const MAX_FOTO_BYTES = 25 * 1024 * 1024
const JPEG_KWALITEIT = 72

/**
 * Haalt een afbeelding op en maakt er een compacte JPEG van op maat.
 *
 * Alles gaat door sharp: dat verkleint (scheelt megabytes per foto), respecteert de EXIF-oriëntatie
 * (telefoonfoto's staan anders op hun kant), en accepteert ook webp/tiff die pdf-lib zelf niet kan
 * insluiten. `flatten` zet transparantie op wit — zonder dat wordt de achtergrond van een
 * handtekening-PNG zwart in JPEG.
 */
export async function haalAfbeelding(url: string, maxPx: number): Promise<{ bytes: Uint8Array } | null> {
  try {
    const res = await haalOp(url, { dienst: 'Fotobestand', timeoutMs: 20_000 })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_FOTO_BYTES) return null

    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_KWALITEIT, mozjpeg: true })
      .toBuffer()
    return { bytes: new Uint8Array(jpeg) }
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → zonder foto verder.
    return null
  }
}
