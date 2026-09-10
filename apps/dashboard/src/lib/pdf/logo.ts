import 'server-only'
import { haalOp } from '@/lib/net/deadline'

/**
 * Het bedrijfslogo klaarmaken voor jsPDF.
 *
 * jsPDF plaatst alleen bitmaps. Het primaire logo in `bedrijfsgegevens` is een
 * SVG, en `addImage` faalt daar stil op — het vel kwam dan zonder logo uit de
 * printer. Vandaar de omweg via sharp (dat al in de app zit voor de foto's in
 * het opleverrapport): SVG in, PNG uit, op een ruime resolutie zodat het op
 * papier scherp blijft.
 *
 * Best-effort: kan het logo niet worden opgehaald of omgezet, dan geeft dit
 * `null` terug en zet de PDF het woordmerk als tekst. Een uitdraai die faalt
 * omdat een plaatje niet laadt, zou een slechte ruil zijn.
 *
 * `breedte`/`hoogte` zijn de pixelmaten van de omgezette PNG. Reken de hoogte
 * op papier daaruit uit in plaats van er een vaste te kiezen: het woordmerk is
 * ± 1,6 : 1, dus een vast blokje van 34 × 12 mm perst het plat. Wie het logo
 * ooit vervangt hoeft dan niets na te meten.
 */
export type PdfLogo = {
  dataUrl: string
  /** jsPDF-formaatnaam, dus 'PNG' of 'JPEG' — SVG kan hij niet plaatsen. */
  format: string
  breedte: number
  hoogte: number
}

export async function laadPdfLogo(url: string | null): Promise<PdfLogo | null> {
  if (!url) return null

  try {
    const res = await haalOp(url, { dienst: 'Bedrijfslogo', timeoutMs: 15_000 })
    if (!res.ok) return null

    const bron = Buffer.from(await res.arrayBuffer())
    const sharp = (await import('sharp')).default

    // density telt alleen voor vectorbronnen; bij een PNG negeert sharp hem.
    // 900 px breed is ruim voor 34 mm op papier (± 670 dpi).
    const png = await sharp(bron, { density: 300 })
      .resize({ width: 900, withoutEnlargement: true })
      .png()
      .toBuffer()

    const meta = await sharp(png).metadata()
    if (!meta.width || !meta.height) return null

    return {
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      format: 'PNG',
      breedte: meta.width,
      hoogte: meta.height,
    }
  } catch {
    return null
  }
}
