/**
 * render-quote-docx.ts
 *
 * Gedeelde Word-render-functie voor offertes. Vult een .docx-template via
 * docxtemplater met de offerte-context en geeft een ingevuld .docx terug.
 *
 * Wordt gebruikt door:
 *  - de /docx-endpoint (directe Word-download)
 *  - de /pdf-endpoint (via Microsoft Graph .docx → PDF)
 *
 * Afbeeldingen ({%logo}, {%handtekening}) via de gratis image-module.
 * Vrije-tekstvelden gaan als platte tekst mee (de Word-template bepaalt de opmaak);
 * `stripHtml` is een veiligheidsnet voor eventuele legacy-HTML in oude offertes.
 */

import { buildRenderContext, type BedrijfContext, type LayoutContext } from './quote-renderer'
import { fixSplitDocxTags, stripHtml } from './docx-utils'
import type { Quote } from './types-quotes'
import { appGraphGetRaw } from '../o365/graph'

/** Gegooid wanneer een layout (nog) geen Word-template heeft gekoppeld. */
export class GeenTemplateError extends Error {
  constructor() {
    super('Geen Word-template geconfigureerd voor deze layout.')
    this.name = 'GeenTemplateError'
  }
}

/**
 * Haalt de .docx-template-buffer op voor een layout. SharePoint/OneDrive-templates
 * worden via Microsoft Graph (app-only) opgehaald; anders uit de Supabase-storage-URL.
 *
 * @throws GeenTemplateError als er geen template gekoppeld is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadQuoteTemplateBuffer(rawLayout: any): Promise<Buffer> {
  const bron: string | null = rawLayout?.docx_template_bron ?? null

  if ((bron === 'sharepoint' || bron === 'onedrive') && rawLayout?.docx_template_drive_id && rawLayout?.docx_template_item_id) {
    return appGraphGetRaw(
      `/drives/${rawLayout.docx_template_drive_id}/items/${rawLayout.docx_template_item_id}/content`,
    )
  }

  const url: string | null = rawLayout?.docx_template_url ?? null
  if (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Template ophalen mislukt: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  throw new GeenTemplateError()
}

// 1×1 transparante PNG — gebruikt als een image-tag in het template staat maar er
// geen afbeelding beschikbaar is, zodat de image-module niet crasht.
const LEGE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Max afmetingen (px @96dpi) waarbinnen een afbeelding wordt geschaald. */
const LOGO_MAX = { w: 240, h: 120 }

interface ExtraImages {
  /** Handtekening-bytes (optioneel; tag {%handtekening}). */
  handtekening?: Buffer | null
}

/**
 * Rendert een offerte naar een ingevuld .docx (Buffer) op basis van een
 * template-buffer.
 */
export async function renderQuoteDocx(
  quote: Quote,
  bedrijf: BedrijfContext,
  layout: LayoutContext,
  templateBuffer: ArrayBuffer | Buffer,
  extra: ExtraImages = {},
): Promise<Buffer> {
  const ctx = buildRenderContext(quote, bedrijf, layout)

  // Logo ophalen (best-effort) en image-context opbouwen
  const logo = await fetchImage(bedrijf.logo_url)

  // Docx-vriendelijke context: HTML uit vrije-tekstvelden strippen naar platte tekst
  const docxCtx = {
    ...ctx,
    offerte: {
      ...ctx.offerte,
      inleiding: stripHtml(ctx.offerte.inleiding),
      slottekst: stripHtml(ctx.offerte.slottekst),
    },
    voorwaarden: stripHtml(ctx.voorwaarden),
    uitsluitingen: stripHtml(ctx.uitsluitingen),
    opmerkingen: stripHtml(ctx.opmerkingen),
    // Image-tags
    logo: logo ?? '',
    handtekening: extra.handtekening ?? '',
  }

  const PizZip = (await import('pizzip')).default
  const Docxtemplater = (await import('docxtemplater')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ImageModule = (await import('docxtemplater-image-module-free' as any)).default
  const { imageSize } = await import('image-size')

  const zip = new PizZip(templateBuffer as ArrayBuffer)
  fixSplitDocxTags(zip)

  const imageModule = new ImageModule({
    centered: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getImage(tagValue: any) {
      if (!tagValue) return LEGE_PIXEL
      return Buffer.isBuffer(tagValue) ? tagValue : Buffer.from(tagValue)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSize(img: Buffer, tagValue: any) {
      if (!tagValue) return [1, 1]
      try {
        const dim = imageSize(new Uint8Array(img))
        return fitSize(dim.width ?? LOGO_MAX.w, dim.height ?? LOGO_MAX.h, LOGO_MAX)
      } catch {
        return [LOGO_MAX.w, LOGO_MAX.h]
      }
    },
  })

  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nullGetter: (part: any) => (part.module ? '' : ''),
  })

  try {
    doc.render(docxCtx)
  } catch (renderErr: unknown) {
    throw new Error(formatDocxError(renderErr))
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** Schaalt (w,h) zodat het binnen `max` past, met behoud van beeldverhouding. */
function fitSize(w: number, h: number, max: { w: number; h: number }): [number, number] {
  if (w <= 0 || h <= 0) return [max.w, max.h]
  const ratio = Math.min(max.w / w, max.h / h, 1)
  return [Math.round(w * ratio), Math.round(h * ratio)]
}

async function fetchImage(url?: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** Zet een docxtemplater-renderfout om in een leesbare melding. */
export function formatDocxError(renderErr: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = renderErr as any
  const details: string[] = []
  if (e?.properties?.errors?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const sub of e.properties.errors as any[]) {
      const xtag = sub?.properties?.xtag ?? ''
      const explanation = sub?.properties?.explanation ?? sub?.message ?? String(sub)
      details.push(xtag ? `Tag {${xtag}}: ${explanation}` : explanation)
    }
  }
  return details.length ? details.join(' | ') : String(renderErr)
}
