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

import { buildRenderContext, type BedrijfContext, type LayoutContext, type DossierContext } from './quote-renderer'
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
  /** Gekoppeld dossier (werkadres, calculator, referenties); leeg als niet gekoppeld. */
  dossier?: DossierContext
  /** True zolang de offerte niet is goedgekeurd; template kan {#is_concept}…{/is_concept} tonen. */
  is_concept?: boolean
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
  const ctx = buildRenderContext(quote, bedrijf, layout, extra.dossier)

  // Logo's ophalen (best-effort) en image-context opbouwen
  const logo = await fetchImage(bedrijf.logo_url)
  const logoWit = await fetchImage(bedrijf.logo_wit_url)

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
    logo_wit: logoWit ?? '',
    handtekening: extra.handtekening ?? '',
    // Conditioneel CONCEPT-blok in de Word-template.
    is_concept: extra.is_concept ?? false,
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
    parser: dottedTagParser,
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

/**
 * Dotted-path parser voor docxtemplater.
 *
 * docxtemplater lost standaard alleen platte tags (`{naam}`) en scope-tags op —
 * NIET de dotted notatie (`{offerte.nummer}`, `{klant.naam}`, `{totalen.totaal}`)
 * waar het hele variabelenpaneel op is gebaseerd. Zonder deze parser bleven al die
 * variabelen leeg. De parser splitst op `.` en zoekt de waarde in de huidige scope
 * en — voor gebruik binnen loops — in de omliggende scopes. `{.}` geeft de scope
 * zelf terug (voor string-array-loops zoals `behandelingen_overzicht`).
 */
function dottedTagParser(tag: string): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (scope: any, context?: any) => any
} {
  const naam = tag.trim()
  if (naam === '.') return { get: (scope) => scope }
  const path = naam.split('.')
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(scope: any, context?: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = (context && context.scopeList) || [scope]
      // Innermost scope eerst, dan naar buiten (voor tags binnen loops).
      for (let i = list.length - 1; i >= 0; i--) {
        let cur = list[i]
        let ok = true
        for (const key of path) {
          if (cur != null && typeof cur === 'object' && cur[key] !== undefined) cur = cur[key]
          else { ok = false; break }
        }
        if (ok) return cur
      }
      return undefined
    },
  }
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

/** Nederlandse labels per docxtemplater-fout-id. */
const DOCX_FOUT_LABELS: Record<string, string> = {
  unclosed_tag: 'Tag niet afgesloten (ontbrekende `}` of gesplitste tag)',
  unopened_tag: 'Sluit-teken zonder open-tag (losse `}` of gesplitste tag)',
  unclosed_loop: 'Loop niet afgesloten',
  unopened_loop: 'Loop-sluit zonder loop-start',
  closing_tag_does_not_match_opening_tag: 'Loop verkeerd genest / verkeerde sluit-tag',
  duplicate_open_tag: 'Dubbele `{` — Word heeft de tag opgeknipt',
  duplicate_close_tag: 'Dubbele `}` — Word heeft de tag opgeknipt',
  raw_tag_outer_invalid: 'Afbeeldings-/raw-tag op een ongeldige plek',
  raw_xml_tag_should_be_only_text_in_paragraph: 'Afbeeldings-tag ({%…}) moet alleen in een eigen alinea staan',
  scopeparser_execution_failed: 'Fout bij het verwerken van de variabele',
}

/** Kort de omringende template-tekst in tot een leesbaar venster rond de fout-tag. */
function docxContextSnippet(context: string, xtag: string): string {
  if (!context) return ''
  const clean = context.replace(/\s+/g, ' ').trim()
  const W = 48
  const zoek = xtag ? clean.indexOf(xtag) : -1
  let start = 0
  let end = Math.min(clean.length, 2 * W)
  if (zoek >= 0) {
    start = Math.max(0, zoek - W)
    end = Math.min(clean.length, zoek + xtag.length + W)
  }
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '')
}

/**
 * Zet een docxtemplater-renderfout om in een leesbare, LOKALISEERBARE melding:
 * per fout het fouttype, de betreffende tag en een stukje omringende tekst
 * (uit `properties.context`) zodat de gebruiker het in Word kan terugzoeken.
 */
export function formatDocxError(renderErr: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = renderErr as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs: any[] = e?.properties?.errors?.length
    ? e.properties.errors
    : (e?.properties ? [e] : [])

  const blokken: string[] = []
  for (const sub of subs) {
    const p = sub?.properties ?? {}
    const label = DOCX_FOUT_LABELS[p.id as string] ?? (p.explanation ?? sub?.message ?? 'Onbekende fout')
    const xtag: string = p.xtag ?? ''
    const snippet = docxContextSnippet(p.context ?? '', xtag)
    let blok = `• ${label}`
    if (xtag) blok += `  —  tag {${xtag}}`
    if (snippet) blok += `\n   zoek in Word naar: "${snippet}"`
    blokken.push(blok)
  }
  return blokken.length ? blokken.join('\n\n') : String(renderErr)
}
