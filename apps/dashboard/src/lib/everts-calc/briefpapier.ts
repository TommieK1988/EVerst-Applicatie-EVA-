/**
 * briefpapier.ts
 *
 * Legt een briefpapier-PDF als achtergrond onder de content-pagina's van een
 * gerenderde offerte-PDF. Werkt volgens het "printen op briefpapier"-principe:
 * per content-pagina wordt eerst het briefpapier getekend en daaroverheen de
 * offerte-inhoud. Omdat Word-PDF's lege gebieden niet met een witvlak vullen,
 * schijnt het briefpapier door op alle onbedrukte delen.
 *
 * Heeft het briefpapier meerdere pagina's, dan wordt per content-pagina de
 * overeenkomstige briefpapier-pagina gebruikt; is die er niet, dan de laatste.
 */

/** Haalt een briefpapier-PDF op als Buffer (best-effort; null bij fout/ontbreken). */
export async function fetchBriefpapier(url?: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (ct && !ct.includes('pdf') && !ct.includes('octet-stream')) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Voegt het briefpapier als achtergrond toe onder elke content-pagina.
 * @returns nieuwe PDF-bytes, of de originele content ongewijzigd bij een fout.
 */
export async function mergeBriefpapierBackground(
  contentPdf: Buffer | Uint8Array,
  briefpapierPdf: Buffer | Uint8Array,
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')

  const contentDoc = await PDFDocument.load(contentPdf)
  const briefDoc = await PDFDocument.load(briefpapierPdf)
  const out = await PDFDocument.create()

  const contentIndices = contentDoc.getPageIndices()
  const briefIndices = briefDoc.getPageIndices()

  const embContent = await out.embedPdf(contentDoc, contentIndices)
  const embBrief = await out.embedPdf(briefDoc, briefIndices)

  for (let i = 0; i < embContent.length; i++) {
    const content = embContent[i]
    const brief = embBrief[Math.min(i, embBrief.length - 1)]
    const page = out.addPage([content.width, content.height])
    // Achtergrond (briefpapier) eerst, geschaald naar de content-paginamaat …
    page.drawPage(brief, { x: 0, y: 0, width: content.width, height: content.height })
    // … daarna de offerte-inhoud eroverheen.
    page.drawPage(content, { x: 0, y: 0, width: content.width, height: content.height })
  }

  return out.save()
}

/**
 * Tekent een diagonaal "CONCEPT"-watermerk over elke pagina. Gebruikt zolang de
 * offerte nog niet is goedgekeurd (zie goedkeuring-gate), zodat previews en
 * downloads herkenbaar concept zijn tot de controller akkoord geeft.
 * @returns nieuwe PDF-bytes, of de originele bytes ongewijzigd bij een fout.
 */
export async function tekenConceptWatermerk(
  pdf: Buffer | Uint8Array,
  tekst = 'CONCEPT',
): Promise<Uint8Array> {
  try {
    const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.load(pdf)
    const font = await doc.embedFont(StandardFonts.HelveticaBold)

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize()
      // Schaal de tekstgrootte op de kleinste paginadimensie zodat het diagonaal past.
      const fontSize = Math.min(width, height) * 0.22
      const tekstBreedte = font.widthOfTextAtSize(tekst, fontSize)
      // Middelpunt van de pagina; verschuif zodat de geroteerde tekst gecentreerd staat.
      const hoek = 45
      const rad = (hoek * Math.PI) / 180
      const x = width / 2 - (tekstBreedte / 2) * Math.cos(rad)
      const y = height / 2 - (tekstBreedte / 2) * Math.sin(rad)
      page.drawText(tekst, {
        x, y,
        size: fontSize,
        font,
        color: rgb(0.6, 0.6, 0.6),
        rotate: degrees(hoek),
        opacity: 0.18,
      })
    }

    return doc.save()
  } catch {
    return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  }
}
